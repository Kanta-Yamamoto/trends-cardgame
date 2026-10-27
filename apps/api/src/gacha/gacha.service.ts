import { randomInt } from "node:crypto";
import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { CARDS } from "@trends/cards";
import { openPack, PACK_COUNTS, PACK_PRICE, type PackCount, packPool } from "@trends/game-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { gachaPulls, gemLogs, userCards, users } from "../db/schema";

/** ジェムの残高（有償・無償） */
export interface Wallet {
  paid: number;
  free: number;
}

/** 開けたパックの 1 枚（isNew：このガチャの前は持っていなかった。同じガチャで 2 枚目以降は false） */
export interface PulledCard {
  id: string;
  isNew: boolean;
}

/** パックに入るカード（★ごと。カードデータから一度だけ作る） */
const POOL = packPool(CARDS);

/** 0 以上 1 未満の乱数（暗号の乱数。結果を読まれないように）。randomInt は幅 2^48 - 1 まで */
const RANGE = 2 ** 47;
const secureRandom = () => randomInt(0, RANGE) / RANGE;

@Injectable()
export class GachaService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async wallet(userId: string): Promise<Wallet> {
    const [u] = await this.db
      .select({ paid: users.gemsPaid, free: users.gemsFree })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) throw new UnauthorizedException("ログインしてください");
    return u;
  }

  /**
   * パックを開ける（1 か 10）。ジェムは無償から先に使う。ジェムを減らす・カードを足す・記録するのは 1 つのトランザクションで。
   * rand は差し替えられる（テスト用）
   */
  async open(userId: string, packs: unknown, rand = secureRandom) {
    if (!PACK_COUNTS.includes(packs as PackCount))
      throw new BadRequestException("開けるパックの数が違います");
    const count = packs as PackCount;
    const cost = count * PACK_PRICE;
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ paid: users.gemsPaid, free: users.gemsFree })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!u) throw new UnauthorizedException("ログインしてください");
      if (u.paid + u.free < cost) throw new BadRequestException("ジェムが足りません");
      const useFree = Math.min(u.free, cost);
      const usePaid = cost - useFree;
      const wallet: Wallet = { paid: u.paid - usePaid, free: u.free - useFree };
      await tx
        .update(users)
        .set({ gemsPaid: wallet.paid, gemsFree: wallet.free })
        .where(eq(users.id, userId));
      await tx.insert(gemLogs).values({ userId, paid: -usePaid, free: -useFree, reason: "gacha" });

      const opened = Array.from({ length: count }, () => openPack(POOL, rand));
      const ids = [...new Set(opened.flat())];
      const owned = new Set(
        (
          await tx
            .select({ id: userCards.cardId })
            .from(userCards)
            .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, ids)))
        ).map((r) => r.id),
      );
      const result: PulledCard[][] = opened.map((pack) =>
        pack.map((id) => {
          const isNew = !owned.has(id);
          owned.add(id);
          return { id, isNew };
        }),
      );
      const counts = new Map<string, number>();
      for (const id of opened.flat()) counts.set(id, (counts.get(id) ?? 0) + 1);
      await tx
        .insert(userCards)
        .values([...counts].map(([cardId, n]) => ({ userId, cardId, count: n })))
        .onConflictDoUpdate({
          target: [userCards.userId, userCards.cardId],
          set: { count: sql`${userCards.count} + excluded.count` },
        });
      await tx.insert(gachaPulls).values({ userId, packs: count, cards: opened });
      return { packs: result, wallet };
    });
  }
}
