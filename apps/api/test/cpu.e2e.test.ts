import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CPU_DECKS } from "@trends/cards";
import type { GameState } from "@trends/game-core";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

// 実際の PostgreSQL に対して動かす。人と組めなかったら CPU と組むまでの待ちは、テストでは短くする
process.env.AUTH_DEV_LOGIN = "true";
process.env.CPU_WAIT_MS = "300";

interface MatchMsg {
  code: string;
  kind: string;
  opponent: { name: string; deck: string } | null;
  state: GameState | null;
}
interface UpdateMsg {
  action: { type: string; player: string };
  state: GameState;
}

describe("ランダムマッチで待機している CPU", () => {
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
    delete process.env.CPU_WAIT_MS;
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
  /** 条件に合う update が届くまで待つ */
  const until = (s: Socket, ok: (u: UpdateMsg) => boolean) =>
    new Promise<UpdateMsg>((resolve) => {
      const on = (u: UpdateMsg) => {
        if (!ok(u)) return;
        s.off("update", on);
        resolve(u);
      };
      s.on("update", on);
    });

  it("人と組めなければ CPU と組み、CPU は自分の番に手を打ってターンを返す。レーティングは動かない", async () => {
    const t = await login("ひとり");
    const q = await connect(t);
    const matched = next<{ code: string }>(q, "matched");
    expect(await emit(q, "queue", { deck: "solo_flame" })).toEqual({ ok: true });
    const { code } = await matched;

    const a = await connect(t);
    const first = next<MatchMsg>(a, "match");
    await emit(a, "join", { code });
    const m = await first;
    expect(m.kind).toBe("cpu");
    expect(m.opponent?.name).toBe("CPU");
    expect(CPU_DECKS).toContain(m.opponent?.deck);

    // CPU の番なら CPU がターンを終えるまで、自分の番ならターンを終えて CPU に回す
    const back = until(a, (u) => u.action.player === "p2" && u.action.type === "endTurn");
    if (m.state?.active === "p1")
      await emit(a, "action", { code, action: { type: "endTurn", player: "p1" } });
    const u = await back;
    expect(u.state.active).toBe("p1");
    expect(u.state.winner).toBeNull();

    const end = until(a, (x) => !!x.state.winner);
    await emit(a, "resign", { code });
    expect((await end).state.winner).toBe("p2");
    const me = await request(app.getHttpServer()).get("/me/rating").set("Authorization", `Bearer ${t}`);
    expect(me.body).toEqual({ rating: 1500, games: 0, wins: 0 });
  }, 40_000);

  it("2 人が並んでいれば、CPU ではなく人どうしで組む", async () => {
    const [ta, tb] = [await login("ふたり"), await login("そろい")];
    const [qa, qb] = [await connect(ta), await connect(tb)];
    const [ma, mb] = [next<{ code: string }>(qa, "matched"), next<{ code: string }>(qb, "matched")];
    await Promise.all([emit(qa, "queue", { deck: "solo_flame" }), emit(qb, "queue", { deck: "solo_idol" })]);
    const [{ code }, { code: codeB }] = [await ma, await mb];
    expect(codeB).toBe(code);
    const info = await request(app.getHttpServer())
      .get(`/matches/${code}`)
      .set("Authorization", `Bearer ${ta}`);
    expect(info.body.kind).toBe("random");
  });
});
