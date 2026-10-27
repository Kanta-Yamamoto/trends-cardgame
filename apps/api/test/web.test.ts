import "reflect-metadata";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveWeb } from "../src/web";

@Module({})
class EmptyModule {}

// 画面の配り方（SPA の道・PWA のキャッシュの指示）。DB は使わない
describe("serveWeb", () => {
  let app: NestExpressApplication;
  const dir = mkdtempSync(join(tmpdir(), "web-"));

  beforeAll(async () => {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<html><head><title>TRENDS</title></head><body></body></html>");
    writeFileSync(join(dir, "sw.js"), "// sw");
    writeFileSync(join(dir, "manifest.webmanifest"), "{}");
    writeFileSync(join(dir, "assets", "index-Ab12_cD3.js"), "//");
    mkdirSync(join(dir, "assets", "cards"));
    writeFileSync(join(dir, "assets", "cards", "c6-art.jpg"), "jpg");
    const mod = await Test.createTestingModule({ imports: [EmptyModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    expect(serveWeb(app, dir)).toBe(true);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("画面の道は index.html を返す", async () => {
    const res = await request(app.getHttpServer()).get("/play").set("Accept", "text/html");
    expect(res.status).toBe(200);
    expect(res.text).toContain("TRENDS");
  });

  it("画面には、リンクのプレビュー（OGP）を <head> に差し込む", async () => {
    const res = await request(app.getHttpServer())
      .get("/")
      .set("Accept", "text/html")
      .set("Host", "trends.example")
      .set("X-Forwarded-Proto", "https");
    expect(res.headers["cache-control"]).toBe("no-cache");
    const head = res.text.slice(0, res.text.indexOf("</head>"));
    expect(head).toContain('property="og:title" content="TRENDS"');
    expect(head).toContain('property="og:image" content="https://trends.example/ogp.jpg"');
    // 対戦の部屋のリンクは、誘われたことが分かる題名にする
    const room = await request(app.getHttpServer()).get("/online/AB12").set("Accept", "text/html");
    expect(room.text).toContain("オンライン対戦に誘われました");
  });

  it("ホストの形がおかしいときは、プレビューの絵の URL を作らない", async () => {
    const res = await request(app.getHttpServer())
      .get("/")
      .set("Accept", "text/html")
      .set("Host", 'evil"><script>');
    expect(res.text).not.toContain("og:image");
    expect(res.text).not.toContain("<script>");
  });

  it("サービスワーカーと manifest は毎回確かめさせる", async () => {
    for (const path of ["/sw.js", "/manifest.webmanifest"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("ハッシュ付きの JS はずっと使ってよい", async () => {
    const res = await request(app.getHttpServer()).get("/assets/index-Ab12_cD3.js");
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("カードの絵は毎回確かめさせる（同じ名前で差し替えるため）", async () => {
    const res = await request(app.getHttpServer()).get("/assets/cards/c6-art.jpg");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers.etag).toBeTruthy();
  });
});
