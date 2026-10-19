import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DECKS } from "@trends/cards";
import { type Action, type GameState, HIDDEN_CARD } from "@trends/game-core";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

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
  });
});
