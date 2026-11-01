import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { CARDS, DECKS } from "@trends/cards";
import { DAILY_PACKS, encodeCustomDeck, starterCollection, WELCOME_PACKS } from "@trends/game-core";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import type { Db } from "../src/db/client";
import { DB } from "../src/db/db.module";
import { userCards, users } from "../src/db/schema";
import { PURCHASE_VERIFIER, type PurchaseVerifier, UNLOCK_PRODUCT } from "../src/purchase/apple";

// 実際の PostgreSQL に対して動かす。App Store の署名の確かめだけ差し替える
process.env.AUTH_DEV_LOGIN = "true";

/** テストの購入：jws は「商品 ID|取引の ID」か「revoked|取引の ID」か、そのほかの文字（確かめられない） */
const fakeVerifier: PurchaseVerifier = {
  verify: async (jws) => {
    const [productId, id] = jws.split("|");
    if (!productId || !id) throw new Error("署名が違う");
    return {
      productId: productId === "revoked" ? UNLOCK_PRODUCT : productId,
      originalTransactionId: id,
      environment: "Sandbox",
      revoked: productId === "revoked",
    };
  },
};

const rarityOf = Object.fromEntries(CARDS.map((c) => [c.id, c.rarity]));

describe("プレイヤー名の登録・買い切り・ガチャ", () => {
  let app: INestApplication;
  let db: Db;
  let jwt: JwtService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PURCHASE_VERIFIER)
      .useValue(fakeVerifier)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    db = mod.get(DB);
    jwt = mod.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  /** Google で初めて入った人と同じ状態（名前はまだ決めていない）のユーザーと、そのトークン */
  const newcomer = async () => {
    const [u] = await db
      .insert(users)
      .values({ sub: `google:test-${Date.now()}-${Math.random()}`, name: "プレイヤー" })
      .returning();
    if (!u) throw new Error("ユーザーを作れませんでした");
    return { id: u.id, token: await jwt.signAsync({ sub: u.id, name: u.name }) };
  };

  /** アプリの端末で初めて入った人。名前も決めたところまで */
  const device = async (secret = `secret-${Date.now()}-${Math.random()}-${"x".repeat(20)}`) => {
    const res = await http().post("/auth/device").send({ secret }).expect(201);
    const named = await http()
      .put("/me/name")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({ name: "そら" })
      .expect(200);
    return { id: res.body.user.id as string, token: named.body.token as string, secret };
  };
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const access = async (token: string) => (await http().get("/me/access").set(as(token)).expect(200)).body;
  const buy = (token: string, id = `tx-${Date.now()}-${Math.random()}`) =>
    http()
      .post("/me/purchase")
      .set(as(token))
      .send({ jws: `${UNLOCK_PRODUCT}|${id}` });

  it("ログインしていなければ使えない", async () => {
    await http().put("/me/name").send({ name: "そら" }).expect(401);
    await http().get("/me/access").expect(401);
    await http().post("/gacha/open").send({ packs: 1 }).expect(401);
    await http().post("/me/purchase").send({ jws: "x" }).expect(401);
    await http().delete("/me").expect(401);
  });

  it("名前を決める前は nameSet が false。決めると新しいトークンが返る", async () => {
    const { token } = await newcomer();
    const me = await http().get("/auth/me").set(as(token)).expect(200);
    expect(me.body.nameSet).toBe(false);

    const bad = await http().put("/me/name").set(as(token)).send({ name: "CPU" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("CPU・運営とまぎらわしい名前は使えません");
    await http()
      .put("/me/name")
      .set(as(token))
      .send({ name: "あ".repeat(11) })
      .expect(400);
    await http().put("/me/name").set(as(token)).send({}).expect(400);

    const ok = await http().put("/me/name").set(as(token)).send({ name: " そら " });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "そら", nameSet: true });
    const me2 = await http().get("/auth/me").set(as(ok.body.token));
    expect(me2.body).toMatchObject({ name: "そら", nameSet: true });
  });

  it("開発用ログインは、入れた名前で決めたことになる", async () => {
    const res = await http()
      .post("/auth/dev")
      .send({ name: `開発${Date.now()}` })
      .expect(201);
    expect(res.body.user.nameSet).toBe(true);
  });

  it("アプリの端末は、同じ秘密の文字列なら同じアカウントに入る。短い文字列は断る", async () => {
    await http().post("/auth/device").send({ secret: "短い" }).expect(400);
    await http().post("/auth/device").send({}).expect(400);
    const a = await device();
    const again = await http().post("/auth/device").send({ secret: a.secret }).expect(201);
    expect(again.body.user).toMatchObject({ id: a.id, name: "そら", nameSet: true });
  });

  it("買う前はチュートリアルの 1 パックだけ開けられ、出たカードは残る", async () => {
    const { id, token } = await device();
    expect(await access(token)).toEqual({ unlocked: false, allCards: false, packs: 1 });
    await http().post("/gacha/open").set(as(token)).send({ packs: 2 }).expect(400);

    const one = await http().post("/gacha/open").set(as(token)).send({ packs: 1 }).expect(200);
    expect(one.body.packs).toHaveLength(1);
    expect(one.body.packs[0]).toHaveLength(5);
    expect(one.body.access).toEqual({ unlocked: false, allCards: false, packs: 0 });
    const ranks = one.body.packs[0].map((c: { id: string }) => rarityOf[c.id]);
    expect(ranks[3]).toBe(3);
    expect(ranks[4]).toBeGreaterThanOrEqual(3);
    expect(one.body.packs[0][3].isNew).toBe(true);
    const owned = await db.select().from(userCards).where(eq(userCards.userId, id));
    expect(owned.reduce((n, r) => n + r.count, 0)).toBe(5);

    const next = await http().post("/gacha/open").set(as(token)).send({ packs: 1 });
    expect(next.status).toBe(403);
    expect(next.body.message).toBe("パックは買い切りのあとに開けられます");
  });

  it("買うと、構築済みデッキのカードを持ち、その日は 10 パック開けられる。同じ購入を送っても増えない", async () => {
    const { id, token } = await device();
    await http().post("/gacha/open").set(as(token)).send({ packs: 1 }).expect(200);
    const tx = `tx-${Date.now()}`;
    const res = await buy(token, tx).expect(200);
    expect(res.body.user.id).toBe(id);
    expect(await access(token)).toEqual({ unlocked: true, allCards: false, packs: WELCOME_PACKS });
    const cards = (await http().get("/me/cards").set(as(token))).body.cards as Record<string, number>;
    for (const [card, n] of Object.entries(starterCollection(DECKS))) {
      expect(cards[card]).toBeGreaterThanOrEqual(n);
    }

    await buy(token, tx).expect(200);
    expect((await access(token)).packs).toBe(WELCOME_PACKS);

    const ten = await http().post("/gacha/open").set(as(token)).send({ packs: 10 }).expect(200);
    expect(ten.body.packs).toHaveLength(10);
    expect(ten.body.access.packs).toBe(0);
    await http().post("/gacha/open").set(as(token)).send({ packs: 1 }).expect(400);
  });

  it("次の日は 3 パックに戻り、ためられない", async () => {
    const { id, token } = await device();
    await buy(token).expect(200);
    await db.update(users).set({ packs: 0, packsDay: "2026-01-01" }).where(eq(users.id, id));
    expect((await access(token)).packs).toBe(DAILY_PACKS);
    await http().post("/gacha/open").set(as(token)).send({ packs: 1 }).expect(200);
    expect((await access(token)).packs).toBe(DAILY_PACKS - 1);
    await db.update(users).set({ packs: 1, packsDay: "2026-01-01" }).where(eq(users.id, id));
    expect((await access(token)).packs).toBe(DAILY_PACKS);
  });

  it("確かめられない購入・違う商品・払い戻された購入では解放しない", async () => {
    const { token } = await device();
    const send = (jws: string) => http().post("/me/purchase").set(as(token)).send({ jws });
    await send("だめ").expect(400);
    await send("other.product|tx").expect(400);
    await send(`revoked|tx-${Date.now()}`).expect(400);
    await http().post("/me/purchase").set(as(token)).send({}).expect(400);
    expect((await access(token)).unlocked).toBe(false);
  });

  it("入れ直して購入を復元すると、元のアカウントに戻る", async () => {
    const before = await device();
    const tx = `tx-restore-${Date.now()}`;
    await buy(before.token, tx).expect(200);
    await http().post("/gacha/open").set(as(before.token)).send({ packs: 2 }).expect(200);

    const fresh = await device();
    const restored = await buy(fresh.token, tx).expect(200);
    expect(restored.body.user.id).toBe(before.id);
    expect((await access(restored.body.token)).packs).toBe(WELCOME_PACKS - 2);
    // 入れ直した端末の秘密の文字列で、元のアカウントに入れる
    const back = await http().post("/auth/device").send({ secret: fresh.secret }).expect(201);
    expect(back.body.user.id).toBe(before.id);
  });

  it("買う前は自分のデッキを保存できず、対戦でも使えない。買うと持っているカードだけで使える", async () => {
    const { token } = await device();
    const deck = [...DECKS.solo_flame];
    const ref = encodeCustomDeck(deck);
    const save = (t: string) =>
      http()
        .put("/me/decks")
        .set(as(t))
        .send({ decks: [{ id: "d", name: "テスト", cards: deck, updated: 1 }] });
    await save(token).expect(403);
    await http().put("/me/decks").set(as(token)).send({ decks: [] }).expect(200);
    await http().post("/matches").set(as(token)).send({ deck: ref }).expect(400);

    await buy(token).expect(200);
    await save(token).expect(200);
    const made = await http().post("/matches").set(as(token)).send({ deck: ref }).expect(201);
    expect(made.body.code).toBeTruthy();

    const other = await device();
    await buy(other.token).expect(200);
    await db.delete(userCards).where(eq(userCards.userId, other.id));
    const lack = await http().post("/matches").set(as(other.token)).send({ deck: ref });
    expect(lack.status).toBe(400);
    expect(lack.body.message).toBe("持っていないカードが入っています");
    // 構築済みデッキは、買わなくても使える
    const free = await device();
    await http().post("/matches").set(as(free.token)).send({ deck: "solo_flame" }).expect(201);
  });

  it("Web の友だち（Google）と開発用は、買わなくても全部使える", async () => {
    const google = await newcomer();
    expect((await access(google.token)).unlocked).toBe(true);
    expect((await access(google.token)).allCards).toBe(true);
    expect((await access(google.token)).packs).toBe(DAILY_PACKS);
  });

  it("データを消すと、カード・デッキ・購入が消え、名前もランキングから消える。同じ購入はまた使える", async () => {
    const { id, token, secret } = await device();
    const tx = `tx-del-${Date.now()}`;
    await buy(token, tx).expect(200);
    await http().delete("/me").set(as(token)).expect(204);

    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row).toMatchObject({ name: "プレイヤー", nameSet: false, unlocked: false, ratedGames: 0 });
    expect(await db.select().from(userCards).where(eq(userCards.userId, id))).toEqual([]);

    const after = await http().post("/auth/device").send({ secret }).expect(201);
    expect(after.body.user.id).not.toBe(id);
    const renamed = await http().put("/me/name").set(as(after.body.token)).send({ name: "そら" }).expect(200);
    await buy(renamed.body.token, tx).expect(200);
    expect((await access(renamed.body.token)).unlocked).toBe(true);
  });

  it("持っているカードを ID ごとの枚数で返す", async () => {
    const { token } = await device();
    await http().get("/me/cards").expect(401);
    const empty = await http().get("/me/cards").set(as(token)).expect(200);
    expect(empty.body.cards).toEqual({});
    const opened = await http().post("/gacha/open").set(as(token)).send({ packs: 1 });
    const got = await http().get("/me/cards").set(as(token));
    const want: Record<string, number> = {};
    for (const c of opened.body.packs[0] as { id: string }[]) want[c.id] = (want[c.id] ?? 0) + 1;
    expect(got.body.cards).toEqual(want);
  });

  it("開けられるのは 1〜10 パックの整数だけ", async () => {
    const { token } = await device();
    for (const packs of [0, 1.5, "10", 100]) {
      await http().post("/gacha/open").set(as(token)).send({ packs }).expect(400);
    }
  });
});
