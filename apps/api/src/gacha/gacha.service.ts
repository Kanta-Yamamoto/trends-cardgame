import { randomInt } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { CARDS } from "@trends/cards";
import { MAX_OPEN_PACKS, openPack, packDay, packPool, packsToday } from "@trends/game-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isOpenAccount, isUnlocked } from "../auth/access";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { gachaPulls, type UserRow, userCards, users } from "../db/schema";

/** このユーザーに今できること。画面はこれを見て、鍵やパックの残りを出す */
export interface Access {
  /** 買い切りを買った（Web の友だちは買わなくても true） */
  unlocked: boolean;
  /** 持っていないカードもデッキに入れられる（Web の友だち） */
  allCards: boolean;
  /** 今開けられるパックの数 */
  packs: number;
}

/** 開けたパックの 1 枚（isNew：このガチャの前は持っていなかった。同じガチャで 2 枚目以降は false） */
export interface PulledCard {
  id: string;
  isNew: boolean;
}

/** 今開けられるパックの数。買う前はチュートリアルの 1 パックだけ */
function packsLeft(u: UserRow, today: string) {
  if (isUnlocked(u)) return packsToday(u.packs, u.packsDay, today);
  return u.tutorialPack ? 1 : 0;
}

const accessOf = (u: UserRow, packs: number): Access => ({
  unlocked: isUnlocked(u),
  allCards: isOpenAccount(u.sub),
  packs,
});

/** パックに入るカード（★ごと。カードデータから一度だけ作る） */
const POOL = packPool(CARDS);

/** 0 以上 1 未満の乱数（暗号の乱数。結果を読まれないように）。randomInt は幅 2^48 - 1 まで */
const RANGE = 2 ** 47;
const secureRandom = () => randomInt(0, RANGE) / RANGE;

@Injectable()
export class GachaService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async access(userId: string): Promise<Access> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new UnauthorizedException("ログインしてください");
    return accessOf(u, packsLeft(u, packDay(new Date())));
  }

  /** 持っているカード（ID ごとの枚数） */
  async collection(userId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ id: userCards.cardId, count: userCards.count })
      .from(userCards)
      .where(eq(userCards.userId, userId));
    return Object.fromEntries(rows.filter((r) => r.count > 0).map((r) => [r.id, r.count]));
  }

  /**
   * パックを開ける。残りを減らす・カードを足す・記録するのは 1 つのトランザクションで。
   * rand は差し替えられる（テスト用）
   */
  async open(userId: string, packs: unknown, rand = secureRandom) {
    if (!Number.isInteger(packs) || (packs as number) < 1 || (packs as number) > MAX_OPEN_PACKS)
      throw new BadRequestException("開けるパックの数が違います");
    const count = packs as number;
    const today = packDay(new Date());
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!u) throw new UnauthorizedException("ログインしてください");
      const left = packsLeft(u, today);
      if (left === 0 && !isUnlocked(u)) throw new ForbiddenException("パックは買い切りのあとに開けられます");
      if (count > left) throw new BadRequestException("今日開けられるパックが足りません");
      await tx
        .update(users)
        .set(isUnlocked(u) ? { packs: left - count, packsDay: today } : { tutorialPack: false })
        .where(eq(users.id, userId));

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
      return { packs: result, access: accessOf(u, left - count) };
    });
  }
}
