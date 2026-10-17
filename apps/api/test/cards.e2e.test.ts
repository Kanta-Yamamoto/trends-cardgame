import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CARDS } from "@trends/cards";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import type { Db } from "../src/db/client";
import { DB } from "../src/db/db.module";
import { cards } from "../src/db/schema";
import { cardRows } from "../src/db/seed-data";

// 実際の PostgreSQL に対して動かす（CI では services の postgres、手元では docker compose）
describe("cards API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    const db = app.get<Db>(DB);
    await db.delete(cards);
    await db.insert(cards).values(cardRows());
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /health", async () => {
    await request(app.getHttpServer()).get("/health").expect(200, { status: "ok" });
  });

  it("GET /cards は全カードを ID 順で返す", async () => {
    const res = await request(app.getHttpServer()).get("/cards").expect(200);
    const ids = CARDS.map((c) => c.id).sort();
    expect(res.body.map((c: { id: string }) => c.id)).toEqual(ids);
    const ren = res.body.find((c: { id: string }) => c.id === "c2");
    expect(ren).toMatchObject({
      name: "レン",
      epithet: "炎上系配信者",
      type: "icon",
      rarity: 5,
      cost: 6,
      attack: 5,
      hp: 4,
      attributes: ["炎上"],
      keywords: ["連撃"],
    });
    expect(ren.dark).toMatchObject({ name: "闇堕ちレン", attack: 7, hp: 3 });
    // 投稿は攻撃力・体力を持たず、イラストがまだないカードは art が null
    expect(res.body.find((c: { id: string }) => c.id === "f5")).toMatchObject({
      type: "post",
      attack: null,
      hp: null,
      art: null,
      target: "enemyIcon",
    });
  });

  it("GET /cards/:id", async () => {
    const res = await request(app.getHttpServer()).get("/cards/c3").expect(200);
    expect(res.body.name).toBe("ミナモ");
  });

  it("存在しない ID は 404", async () => {
    await request(app.getHttpServer()).get("/cards/zzz").expect(404);
  });
});
