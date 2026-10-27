import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { CARDS } from "@trends/cards";
import { PACK_PRICE } from "@trends/game-core";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import type { Db } from "../src/db/client";
import { DB } from "../src/db/db.module";
import { userCards, users } from "../src/db/schema";
import { WELCOME_GEMS } from "../src/gacha/gems";

// 実際の PostgreSQL に対して動かす
process.env.AUTH_DEV_LOGIN = "true";

const rarityOf = Object.fromEntries(CARDS.map((c) => [c.id, c.rarity]));

describe("プレイヤー名の登録とガチャ", () => {
  let app: INestApplication;
  let db: Db;
  let jwt: JwtService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it("ログインしていなければ使えない", async () => {
    await http().put("/me/name").send({ name: "そら" }).expect(401);
    await http().get("/me/wallet").expect(401);
    await http().post("/gacha/open").send({ packs: 1 }).expect(401);
  });

  it("名前を決める前は nameSet が false。決めると新しいトークンが返り、初めてのときだけジェムが配られる", async () => {
    const { token } = await newcomer();
    const me = await http().get("/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(me.body.nameSet).toBe(false);

    const bad = await http().put("/me/name").set("Authorization", `Bearer ${token}`).send({ name: "CPU" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("CPU・運営とまぎらわしい名前は使えません");
    await http()
      .put("/me/name")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "あ".repeat(11) })
      .expect(400);
    await http().put("/me/name").set("Authorization", `Bearer ${token}`).send({}).expect(400);

    const ok = await http().put("/me/name").set("Authorization", `Bearer ${token}`).send({ name: " そら " });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "そら", nameSet: true });
    expect(ok.body.welcomeGems).toBe(WELCOME_GEMS);
    const next = ok.body.token as string;
    const wallet = await http().get("/me/wallet").set("Authorization", `Bearer ${next}`).expect(200);
    expect(wallet.body).toEqual({ paid: 0, free: WELCOME_GEMS });

    // 変えたときは配らない
    const renamed = await http()
      .put("/me/name")
      .set("Authorization", `Bearer ${next}`)
      .send({ name: "そらまめ" })
      .expect(200);
    expect(renamed.body.welcomeGems).toBe(0);
    const again = await http().get("/me/wallet").set("Authorization", `Bearer ${next}`);
    expect(again.body.free).toBe(WELCOME_GEMS);
    const me2 = await http().get("/auth/me").set("Authorization", `Bearer ${next}`);
    expect(me2.body).toMatchObject({ name: "そらまめ", nameSet: true });
  });

  it("開発用ログインは、入れた名前で決めたことになる", async () => {
    const res = await http()
      .post("/auth/dev")
      .send({ name: `開発${Date.now()}` })
      .expect(201);
    expect(res.body.user.nameSet).toBe(true);
  });

  it("パックを開けると、無償のジェムから使い、5 枚ずつ出る。持っているカードに足される", async () => {
    const { id, token } = await newcomer();
    const named = await http()
      .put("/me/name")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "ガチャ係" });
    const t = named.body.token as string;
    await db.update(users).set({ gemsPaid: 100 }).where(eq(users.id, id));

    const one = await http()
      .post("/gacha/open")
      .set("Authorization", `Bearer ${t}`)
      .send({ packs: 1 })
      .expect(200);
    expect(one.body.packs).toHaveLength(1);
    expect(one.body.packs[0]).toHaveLength(5);
    expect(one.body.wallet).toEqual({ paid: 100, free: WELCOME_GEMS - PACK_PRICE });
    const ranks = one.body.packs[0].map((c: { id: string }) => rarityOf[c.id]);
    expect(ranks[3]).toBe(3);
    expect(ranks[4]).toBeGreaterThanOrEqual(3);
    // 初めて出たカードは NEW
    expect(one.body.packs[0][3].isNew).toBe(true);

    const ten = await http()
      .post("/gacha/open")
      .set("Authorization", `Bearer ${t}`)
      .send({ packs: 10 })
      .expect(200);
    expect(ten.body.packs).toHaveLength(10);
    // 同じガチャの中で 2 枚目以降は NEW にしない
    const seen = new Set<string>(one.body.packs[0].map((c: { id: string }) => c.id));
    for (const c of ten.body.packs.flat() as { id: string; isNew: boolean }[]) {
      expect(c.isNew).toBe(!seen.has(c.id));
      seen.add(c.id);
    }

    const owned = await db.select().from(userCards).where(eq(userCards.userId, id));
    expect(owned.reduce((n, r) => n + r.count, 0)).toBe(55);

    // 残り 1,350 + 有償 100 では 10 パック（1,500）に足りない。無償を使い切ってから有償を使う
    const wallet = await http().get("/me/wallet").set("Authorization", `Bearer ${t}`);
    expect(wallet.body).toEqual({ paid: 100, free: WELCOME_GEMS - PACK_PRICE * 11 });
    await http().post("/gacha/open").set("Authorization", `Bearer ${t}`).send({ packs: 10 }).expect(400);
    await db.update(users).set({ gemsFree: 100 }).where(eq(users.id, id));
    const mixed = await http()
      .post("/gacha/open")
      .set("Authorization", `Bearer ${t}`)
      .send({ packs: 1 })
      .expect(200);
    expect(mixed.body.wallet).toEqual({ paid: 50, free: 0 });
  });

  it("開けられるのは 1 パックか 10 パックだけ", async () => {
    const res = await http()
      .post("/auth/dev")
      .send({ name: `数チェック${Date.now()}` });
    const t = res.body.token as string;
    for (const packs of [0, 2, 3, "10", 100]) {
      await http().post("/gacha/open").set("Authorization", `Bearer ${t}`).send({ packs }).expect(400);
    }
  });
});
