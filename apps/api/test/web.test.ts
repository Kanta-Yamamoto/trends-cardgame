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
    writeFileSync(join(dir, "index.html"), "<title>TRENDS</title>");
    writeFileSync(join(dir, "sw.js"), "// sw");
    writeFileSync(join(dir, "manifest.webmanifest"), "{}");
    writeFileSync(join(dir, "assets", "index-Ab12_cD3.js"), "//");
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
});
