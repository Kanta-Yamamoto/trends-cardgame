import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DECKS } from "@trends/cards";
import { type Action, type GameState, HIDDEN_CARD } from "@trends/game-core";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { EMPTY_CLOSE_MS, MatchesGateway } from "../src/matches/matches.gateway";

// 実際の PostgreSQL に対して動かす。ログインは開発用（名前だけ）を使う
process.env.AUTH_DEV_LOGIN = "true";

interface MatchMsg {
  code: string;
  status: string;
  me: { name: string } | null;
  opponent: { name: string } | null;
  state: GameState | null;
}
interface UpdateMsg {
  action: Action;
  state: GameState;
}

describe("ログインとオンライン対戦", () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

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
    const res = await request(app.getHttpServer()).post("/auth/dev").send({ name }).expect(201);
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

  it("ログインの設定と、トークンでの本人確認", async () => {
    const cfg = await request(app.getHttpServer()).get("/auth/config").expect(200);
    expect(cfg.body.devLogin).toBe(true);
    await request(app.getHttpServer()).get("/auth/me").expect(401);
    const token = await login("たろう");
    const me = await request(app.getHttpServer()).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.name).toBe("たろう");
  });

  it("自分で組んだデッキ（custom:…）でも部屋を作れる。決まりを守らないデッキは断られる", async () => {
    const t = await login("くみて");
    const ok = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${t}`)
      .send({ deck: `custom:${DECKS.solo_idol.join(",")}` })
      .expect(201);
    expect(ok.body.players.p1.deck.startsWith("custom:")).toBe(true);
    // 29 枚
    await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${t}`)
      .send({ deck: `custom:${DECKS.solo_idol.slice(1).join(",")}` })
      .expect(400);
    // 属性が2つ（炎上と メロい）
    const two = [...DECKS.solo_flame.slice(0, 27), "m6", "m6", "m6"];
    const bad = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${t}`)
      .send({ deck: `custom:${two.join(",")}` })
      .expect(400);
    expect(bad.body.message).toContain("属性は1つまで");
    // 存在しないデッキ（前の 2 属性の構築済みデッキも含む）
    await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${t}`)
      .send({ deck: "flame" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${t}`)
      .send({ deck: "nope" })
      .expect(400);
  });

  it("部屋を作り、合言葉で相手が入ると対戦が始まる。操作は両者に届き、相手の手札は見えない", async () => {
    const [ta, tb] = [await login("あいこ"), await login("ぶんた")];
    const created = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${ta}`)
      .send({ deck: "solo_flame" })
      .expect(201);
    const code = created.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const a = await connect(ta);
    const waiting = next<MatchMsg>(a, "match");
    expect(await emit(a, "join", { code })).toEqual({ ok: true });
    expect((await waiting).status).toBe("waiting");

    const b = await connect(tb);
    const [ma, mb] = [next<MatchMsg>(a, "match"), next<MatchMsg>(b, "match")];
    expect(await emit(b, "join", { code, deck: "solo_idol" })).toEqual({ ok: true });
    const [sa, sb] = [await ma, await mb];
    expect(sa.status).toBe("playing");
    // 対戦中の数（デプロイを待つのに使う）
    const live = await request(app.getHttpServer()).get("/health").expect(200);
    expect(live.body.liveMatches).toBe(1);
    expect(sa.opponent?.name).toBe("ぶんた");
    expect(sb.opponent?.name).toBe("あいこ");
    // どちらも自分が p1 に見える。相手の手札は隠れている
    expect(sa.state?.players.p2.hand.every((c) => c === HIDDEN_CARD)).toBe(true);
    expect(sb.state?.players.p1.hand.some((c) => c !== HIDDEN_CARD)).toBe(true);
    expect(sa.state?.active).not.toBe(sb.state?.active);

    // 番の人がターンを終えると、両者に届く。番でない人の操作は反則
    const [first, second] = sa.state?.active === "p1" ? [a, b] : [b, a];
    expect((await emit(second, "action", { code, action: { type: "endTurn", player: "p1" } })).ok).toBe(
      false,
    );
    const [u1, u2] = [next<UpdateMsg>(first, "update"), next<UpdateMsg>(second, "update")];
    expect(await emit(first, "action", { code, action: { type: "endTurn", player: "p1" } })).toEqual({
      ok: true,
    });
    const [r1, r2] = [await u1, await u2];
    expect(r1.state.active).toBe("p2");
    expect(r2.state.active).toBe("p1");
    expect(r2.action.player).toBe("p2"); // 相手の操作として届く

    // 3人目は入れない。再接続（同じ人がもう一度 join）はできる
    const c = await connect(await login("さぶろう"));
    expect((await emit(c, "join", { code, deck: "solo_meme" })).ok).toBe(false);
    const again = await connect(ta);
    const back = next<MatchMsg>(again, "match");
    await emit(again, "join", { code });
    expect((await back).state?.players.p1.hand).toEqual(
      sa.state?.active === "p1" ? r1.state.players.p1.hand : r2.state.players.p1.hand,
    );

    // 降参すると相手の勝ち
    const end = next<UpdateMsg>(b, "update");
    expect(await emit(a, "resign", { code })).toEqual({ ok: true });
    expect((await end).state.winner).toBe("p1");
    const done = await request(app.getHttpServer()).get("/health").expect(200);
    expect(done.body.liveMatches).toBe(0);
  });

  it("通信が切れても、決着していない対戦は続き、その部屋に戻れる。戻るまではほかの部屋に入れない", async () => {
    // DB は消さないので、名前は毎回変える
    const tag = randomUUID().slice(0, 6);
    const [ta, tb, tc] = [await login(`もどる${tag}`), await login(`まつ${tag}`), await login(`べつ${tag}`)];
    const current = async (t: string) =>
      (await request(app.getHttpServer()).get("/me/match").set("Authorization", `Bearer ${t}`).expect(200))
        .body as { match: { code: string; status: string; players: { p2: { name: string } | null } } | null };
    const created = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${ta}`)
      .send({ deck: "solo_flame" })
      .expect(201);
    const code = created.body.code as string;
    // 相手を待っているあいだは、まだ対戦ではない
    expect((await current(ta)).match).toBeNull();

    const a = await connect(ta);
    await emit(a, "join", { code });
    const b = await connect(tb);
    const started = next<MatchMsg>(b, "match");
    await emit(b, "join", { code, deck: "solo_idol" });
    await started;
    const mine = await current(ta);
    expect(mine.match?.code).toBe(code);
    expect(mine.match?.players.p2?.name).toBe(`まつ${tag}`);
    expect((await current(tc)).match).toBeNull();

    // 通信が切れても、対戦は続いている
    a.disconnect();
    expect((await current(ta)).match?.code).toBe(code);

    // 戻るまでは、ほかの部屋を作る・入る・ランダムマッチに並ぶことはできない
    const busy = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${ta}`)
      .send({ deck: "solo_flame" })
      .expect(409);
    expect(busy.body.message).toContain("対戦中の部屋があります");
    const other = await request(app.getHttpServer())
      .post("/matches")
      .set("Authorization", `Bearer ${tc}`)
      .send({ deck: "solo_meme" })
      .expect(201);
    const back = await connect(ta);
    expect(await emit(back, "join", { code: other.body.code, deck: "solo_flame" })).toMatchObject({
      ok: false,
      error: "対戦中の部屋があります。先にその対戦に戻ってください",
    });
    expect((await emit(back, "queue", { deck: "solo_flame" })).ok).toBe(false);

    // 同じ部屋には戻れる。決着すると、戻る対戦は無くなる
    const resumed = next<MatchMsg>(back, "match");
    expect(await emit(back, "join", { code })).toEqual({ ok: true });
    expect((await resumed).status).toBe("playing");
    const end = next<UpdateMsg>(b, "update");
    await emit(back, "resign", { code });
    expect((await end).state.winner).toBe("p1");
    expect((await current(ta)).match).toBeNull();
    expect((await current(tb)).match).toBeNull();
  });

  it("2 人とも抜けたまま時間がたつと、決着なしで閉じる。時間内にだれか戻れば続く", async () => {
    const gateway = app.get(MatchesGateway);
    gateway.closeAfterMs = 400;
    try {
      const tag = randomUUID().slice(0, 6);
      const [ta, tb] = [await login(`ぬける${tag}`), await login(`のこる${tag}`)];
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const current = async (t: string) =>
        (await request(app.getHttpServer()).get("/me/match").set("Authorization", `Bearer ${t}`).expect(200))
          .body as { match: { code: string } | null; closesIn: number | null };
      const start = async () => {
        const created = await request(app.getHttpServer())
          .post("/matches")
          .set("Authorization", `Bearer ${ta}`)
          .send({ deck: "solo_flame" })
          .expect(201);
        const code = created.body.code as string;
        const a = await connect(ta);
        await emit(a, "join", { code });
        const b = await connect(tb);
        const started = next<MatchMsg>(b, "match");
        await emit(b, "join", { code, deck: "solo_idol" });
        await started;
        return { code, a, b };
      };

      // 片方だけ抜けても、対戦は続く（閉じるまでの残りは無い）
      const one = await start();
      one.a.disconnect();
      await wait(600);
      expect(await current(ta)).toMatchObject({ match: { code: one.code }, closesIn: null });

      // もう片方も抜けると、閉じるまでの残りが出て、時間がたつと閉じる
      one.b.disconnect();
      await wait(100);
      const closing = await current(tb);
      expect(closing.match?.code).toBe(one.code);
      expect(closing.closesIn).toBeGreaterThan(0);
      await wait(600);
      expect((await current(ta)).match).toBeNull();
      expect((await current(tb)).match).toBeNull();
      // 入り直すと閉じたことが分かり、操作はできない。ほかの部屋は作れる
      const back = await connect(ta);
      const seen = next<MatchMsg>(back, "match");
      await emit(back, "join", { code: one.code });
      expect((await seen).status).toBe("closed");
      expect(
        await emit(back, "action", { code: one.code, action: { type: "endTurn", player: "p1" } }),
      ).toEqual({
        ok: false,
        error: "この対戦は、2人とも抜けたので閉じました",
      });
      back.disconnect();

      // 2 人とも抜けても、時間内に戻れば続く
      const two = await start();
      two.a.disconnect();
      two.b.disconnect();
      await wait(100);
      const again = await connect(ta);
      await emit(again, "join", { code: two.code });
      await wait(600);
      expect(await current(ta)).toMatchObject({ match: { code: two.code }, closesIn: null });
      await emit(again, "resign", { code: two.code });
    } finally {
      gateway.closeAfterMs = EMPTY_CLOSE_MS;
    }
  });

  it("招待リンクの守りが効いているときは、招待済みのクッキーが無い接続を断る", async () => {
    const token = await login("まねかれず");
    process.env.INVITE_CODE = "test-invite";
    try {
      const err = await new Promise<Error>((resolve, reject) => {
        const s = io(url, {
          auth: { token },
          transports: ["websocket"],
          forceNew: true,
          reconnection: false,
        });
        sockets.push(s);
        s.on("connect", () => reject(new Error("つながってしまった")));
        s.on("connect_error", resolve);
      });
      expect(err.message).toContain("招待");
    } finally {
      delete process.env.INVITE_CODE;
    }
  });

  it("友だちを誘うリンクに付ける合言葉を渡す（守りが効いていなければ null）", async () => {
    const res = await request(app.getHttpServer()).get("/auth/invite").expect(200);
    expect(res.body).toEqual({ invite: null });
    expect(res.headers["cache-control"]).toBe("no-store");
    process.env.INVITE_CODE = "test-invite";
    try {
      const on = await request(app.getHttpServer()).get("/auth/invite").expect(200);
      expect(on.body).toEqual({ invite: "test-invite" });
    } finally {
      delete process.env.INVITE_CODE;
    }
  });
});
