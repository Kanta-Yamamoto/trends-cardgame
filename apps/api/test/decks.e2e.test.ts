import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { MAX_DECKS } from "../src/decks/decks.service";

// 実際の PostgreSQL に対して動かす。ログインは開発用（名前だけ）を使う
process.env.AUTH_DEV_LOGIN = "true";

describe("アカウントに保存するデッキ", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const login = async (name: string) => {
    const res = await request(app.getHttpServer()).post("/auth/dev").send({ name }).expect(201);
    return res.body.token as string;
  };
  const deck = (id: string, name = "テスト") => ({ id, name, cards: ["f1", "f1", "f2"], updated: 1000 });

  it("ログインしていなければ使えない", async () => {
    await request(app.getHttpServer()).get("/me/decks").expect(401);
    await request(app.getHttpServer()).put("/me/decks").send({ decks: [] }).expect(401);
  });

  it("保存したデッキは、同じアカウントで入り直しても取れる（ほかの人には見えない）", async () => {
    const name = `デッキ係${Date.now()}`;
    const a = await login(name);
    const empty = await request(app.getHttpServer()).get("/me/decks").set("Authorization", `Bearer ${a}`);
    expect(empty.status).toBe(200);
    expect(empty.body.decks).toEqual([]);

    await request(app.getHttpServer())
      .put("/me/decks")
      .set("Authorization", `Bearer ${a}`)
      .send({ decks: [deck("d1", "炎上"), deck("d2")] })
      .expect(200);

    // 別の端末から同じアカウントで入った想定（開発用ログインは同じ名前なら同じユーザー）
    const again = await login(name);
    const res = await request(app.getHttpServer()).get("/me/decks").set("Authorization", `Bearer ${again}`);
    expect(res.body.decks.map((d: { id: string }) => d.id)).toEqual(["d1", "d2"]);
    expect(res.body.decks[0].name).toBe("炎上");

    const other = await login(`${name}の友だち`);
    const theirs = await request(app.getHttpServer())
      .get("/me/decks")
      .set("Authorization", `Bearer ${other}`);
    expect(theirs.body.decks).toEqual([]);

    // まるごと置き換え（消したデッキは残らない）
    await request(app.getHttpServer())
      .put("/me/decks")
      .set("Authorization", `Bearer ${a}`)
      .send({ decks: [deck("d2")] })
      .expect(200);
    const after = await request(app.getHttpServer()).get("/me/decks").set("Authorization", `Bearer ${a}`);
    expect(after.body.decks.map((d: { id: string }) => d.id)).toEqual(["d2"]);
  });

  it("形がおかしい一覧は断る", async () => {
    const t = await login(`形チェック${Date.now()}`);
    const put = (body: object) =>
      request(app.getHttpServer()).put("/me/decks").set("Authorization", `Bearer ${t}`).send(body);
    await put({}).expect(400);
    await put({ decks: [{ id: "x", name: "a", cards: "f1" }] }).expect(400);
    await put({ decks: [deck("same"), deck("same")] }).expect(400);
    await put({ decks: Array.from({ length: MAX_DECKS + 1 }, (_, i) => deck(`d${i}`)) }).expect(400);
  });
});
