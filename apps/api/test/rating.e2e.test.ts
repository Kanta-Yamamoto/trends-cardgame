import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CLOCK, type ClockView, type GameState } from "@trends/game-core";
import { eq } from "drizzle-orm";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import type { Db } from "../src/db/client";
import { DB } from "../src/db/db.module";
import { matches } from "../src/db/schema";
import { RankingService } from "../src/ranking/ranking.service";

// 実際の PostgreSQL に対して動かす。ログインは開発用（名前だけ）。DB は消さないので、名前は毎回変える
process.env.AUTH_DEV_LOGIN = "true";

interface MatchMsg {
  code: string;
  kind: string;
  state: GameState | null;
  clock: ClockView | null;
}
interface UpdateMsg {
  state: GameState;
  events: { type: string }[];
  clock: ClockView | null;
}
type Rated = { before: number; after: number };

describe("ランダムマッチ・持ち時間・レーティング・ランキング", () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const tag = randomUUID().slice(0, 6);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app?.close();
  });

  const login = async (name: string) => {
    const res = await request(app.getHttpServer())
      .post("/auth/dev")
      .send({ name: `${name}${tag}` })
      .expect(201);
    return res.body.token as string;
  };
  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(url, { auth: { token }, transports: ["websocket"], forceNew: true });
      sockets.push(s);
      s.on("connect", () => resolve(s));
      s.on("connect_error", reject);
    });
  const next = <T>(s: Socket, ev: string) => new Promise<T>((resolve) => s.once(ev, resolve));
  const emit = (s: Socket, ev: string, body: unknown) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => s.emit(ev, body, resolve));
  const rating = async (token: string) =>
    (await request(app.getHttpServer()).get("/me/rating").set("Authorization", `Bearer ${token}`).expect(200))
      .body as { rating: number; games: number; wins: number };

  /** 2 人をランダムマッチで組み、部屋に入ったところまで進める */
  const pair = async (an: string, bn: string) => {
    const [ta, tb] = [await login(an), await login(bn)];
    const [qa, qb] = [await connect(ta), await connect(tb)];
    expect(await emit(qa, "queue", { deck: "nope" })).toMatchObject({ ok: false });
    const [ma, mb] = [next<{ code: string }>(qa, "matched"), next<{ code: string }>(qb, "matched")];
    expect(await emit(qa, "queue", { deck: "solo_flame" })).toEqual({ ok: true });
    expect(await emit(qb, "queue", { deck: "solo_idol" })).toEqual({ ok: true });
    const [{ code }, { code: codeB }] = [await ma, await mb];
    expect(codeB).toBe(code);
    const [a, b] = [await connect(ta), await connect(tb)];
    const [sa, sb] = [next<MatchMsg>(a, "match"), next<MatchMsg>(b, "match")];
    await emit(a, "join", { code });
    await emit(b, "join", { code });
    return { code, ta, tb, a, b, sa: await sa, sb: await sb };
  };

  it("待ち行列の 2 人が組まれ、持ち時間つきで対戦が始まる。降参で決着するとレーティングが 16 動く", async () => {
    const { code, ta, tb, a, b, sa } = await pair("らんだ", "むまち");
    expect(sa.kind).toBe("random");
    expect(sa.state?.turn).toBe(1);
    expect(sa.clock?.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs });
    expect(sa.clock?.turnLeft).toBe(CLOCK.turnMs);
    const info = await request(app.getHttpServer())
      .get(`/matches/${code}`)
      .set("Authorization", `Bearer ${ta}`);
    expect(info.body.kind).toBe("random");

    // 時間切れの操作は、画面からは送れない
    expect((await emit(a, "action", { code, action: { type: "timeout", player: "p1" } })).ok).toBe(false);

    const [ra, rb] = [next<Rated>(a, "rated"), next<Rated>(b, "rated")];
    expect(await emit(a, "resign", { code })).toEqual({ ok: true });
    expect(await ra).toEqual({ before: 1500, after: 1484 });
    expect(await rb).toEqual({ before: 1500, after: 1516 });
    expect(await rating(ta)).toEqual({ rating: 1484, games: 1, wins: 0 });
    expect(await rating(tb)).toEqual({ rating: 1516, games: 1, wins: 1 });

    // 決着したあとに入り直しても、レーティングの動きが分かる
    const again = await connect(tb);
    const back = next<MatchMsg & { rating: Rated }>(again, "match");
    await emit(again, "join", { code });
    expect((await back).rating).toEqual({ before: 1500, after: 1516 });
  });

  it("持ち時間を使い切ると、サーバーが時間切れの負けにして、レーティングも動く", async () => {
    const { code, ta, tb, a, sa } = await pair("じかん", "ぎれ");
    // 手番の人が、ターンの 30 秒と持ち時間 5 分を使い切ったことにする
    const db = app.get<Db>(DB);
    const [row] = await db.select().from(matches).where(eq(matches.code, code));
    const clock = row?.clock;
    if (!clock) throw new Error("時計がありません");
    await db
      .update(matches)
      .set({ clock: { ...clock, since: Date.now() - CLOCK.turnMs - CLOCK.bankMs - 1000 } })
      .where(eq(matches.code, code));
    // 入り直すと、サーバーが時間切れを見つけて進める
    const done = next<UpdateMsg>(a, "update");
    await emit(a, "join", { code });
    const u = await done;
    expect(u.events.map((e) => e.type)).toEqual(["timedOut", "won"]);
    const mine = sa.state?.active === "p1";
    expect(u.state.winner).toBe(mine ? "p2" : "p1");
    const loser = mine ? ta : tb;
    expect((await rating(loser)).rating).toBe(1484);
  });

  it("友だちとの部屋は、決着してもレーティングが動かない", async () => {
    const [ta, tb] = [await login("ともだ"), await login("ちべや")];
    const created = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${ta}`)
      .send({ deck: "solo_flame" })
      .expect(201);
    const code = created.body.code as string;
    expect(created.body.kind).toBe("friend");
    const [a, b] = [await connect(ta), await connect(tb)];
    await emit(a, "join", { code });
    const started = next<MatchMsg>(a, "match");
    await emit(b, "join", { code, deck: "solo_idol" });
    expect((await started).clock?.bank.p1).toBe(CLOCK.bankMs);
    const end = next<UpdateMsg>(b, "update");
    await emit(a, "resign", { code });
    expect((await end).state.winner).toBe("p1");
    expect(await rating(ta)).toEqual({ rating: 1500, games: 0, wins: 0 });
    expect(await rating(tb)).toEqual({ rating: 1500, games: 0, wins: 0 });
  });

  it("ランキングは 10 分ごとの集計で、1 試合ごとには変わらない", async () => {
    const ranking = app.get(RankingService);
    ranking.reset();
    const t = await login("じゅんい");
    const first = await request(app.getHttpServer()).get("/rankings").set("Authorization", `Bearer ${t}`);
    expect(first.status).toBe(200);
    const names = (first.body.players as { name: string }[]).map((p) => p.name);
    expect(names).toContain(`むまち${tag}`);
    expect(first.body.me).toMatchObject({ rating: 1500, games: 0, rank: null });
    // 上位は高い順
    const rates = (first.body.players as { rating: number }[]).map((p) => p.rating);
    expect(rates).toEqual([...rates].sort((x, y) => y - x));

    // 新しい試合が決着しても、同じ区切りのあいだは集計を使い回す
    await pair("あとから", "かったひと").then(async ({ code, a }) => {
      const end = next<Rated>(a, "rated");
      await emit(a, "resign", { code });
      await end;
    });
    const second = await request(app.getHttpServer()).get("/rankings").set("Authorization", `Bearer ${t}`);
    expect(second.body.updatedAt).toBe(first.body.updatedAt);
    expect((second.body.players as { name: string }[]).map((p) => p.name)).not.toContain(`かったひと${tag}`);
    await request(app.getHttpServer()).get("/rankings").expect(401);
  });
});
