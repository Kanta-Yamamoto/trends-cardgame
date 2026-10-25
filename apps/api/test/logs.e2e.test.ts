import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DECKS } from "@trends/cards";
import { type CpuGameRecord, createGame } from "@trends/game-core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

// 実際の PostgreSQL に対して動かす
describe("CPU 対戦の記録", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const record = (winner: "p1" | "p2" | null): CpuGameRecord => {
    const initial = createGame({
      decks: { p1: DECKS.solo_idol, p2: DECKS.solo_expert },
      seed: 5,
      first: "p1",
    });
    return {
      v: 1,
      cards: "0123abcd",
      human: "p1",
      cpu: "p2",
      humanDeck: { ref: "solo_idol", name: "推し", cards: [...DECKS.solo_idol] },
      cpuDeck: { ref: "solo_expert", cards: [...DECKS.solo_expert] },
      seed: 5,
      first: "p1",
      startedAt: 1000,
      initial,
      moves: [{ action: { type: "endTurn", player: "p1" }, at: 3000 }],
      thoughts: [{ bias: 0, nodes: 10, options: [], chosen: -1, move: 1 }],
      end: { winner, turn: 7, at: 60_000 },
    };
  };

  it("送った記録を残し、あとから古い順に取り出せる（勝ったのが人か CPU かも分かる）", async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    const client = `端末${Date.now()}`;
    const a = await request(app.getHttpServer())
      .post("/logs/cpu-games")
      .send({ client, record: record("p1") })
      .expect(201);
    expect(a.body.id).toBeTypeOf("string");
    await request(app.getHttpServer())
      .post("/logs/cpu-games")
      .send({ client, record: record(null) })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/logs/cpu-games?after=${before}`).expect(200);
    const mine = res.body.games.filter((g: { client: string }) => g.client === client);
    expect(mine.map((g: { winner: string | null }) => g.winner)).toEqual(["human", null]);
    expect(mine[0]).toMatchObject({
      humanDeck: "solo_idol",
      cpuDeck: "solo_expert",
      turns: 7,
      cards: "0123abcd",
    });
    expect(mine[0].record.moves).toEqual([{ action: { type: "endTurn", player: "p1" }, at: 3000 }]);
    expect(mine[0].record.initial.players.p1.deck.length).toBeGreaterThan(0);
  });

  it("形のおかしい記録は断る", async () => {
    await request(app.getHttpServer())
      .post("/logs/cpu-games")
      .send({ record: record("p1") })
      .expect(400);
    await request(app.getHttpServer())
      .post("/logs/cpu-games")
      .send({ client: "x", record: { ...record("p1"), v: 2 } })
      .expect(400);
    await request(app.getHttpServer())
      .post("/logs/cpu-games")
      .send({ client: "x", record: { ...record("p1"), human: "p2" } })
      .expect(400);
    await request(app.getHttpServer()).get("/logs/cpu-games?after=きのう").expect(400);
  });
});
