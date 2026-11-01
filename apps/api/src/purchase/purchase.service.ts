import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { DECKS } from "@trends/cards";
import { packDay, starterCollection, WELCOME_PACKS } from "@trends/game-core";
import { eq, sql } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { purchases, userCards, users } from "../db/schema";
import { PURCHASE_VERIFIER, type PurchaseVerifier, UNLOCK_PRODUCT } from "./apple";

/** 買い切りを買ったときに持っているカード */
const STARTER = Object.entries(starterCollection(DECKS));

@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PURCHASE_VERIFIER) private readonly verifier: PurchaseVerifier,
    private readonly auth: AuthService,
  ) {}

  /**
   * App Store が署名した購入を受け取り、買い切りを解放する。購入と「購入を復元」の両方がここに来る。
   * 同じ購入が別のアカウントに結び付いていれば、入れ直した端末なので、この端末を元のアカウントに付け替える
   */
  async apply(userId: string, jws: unknown) {
    if (typeof jws !== "string" || jws.length === 0 || jws.length > 20_000)
      throw new BadRequestException("購入の情報がありません");
    const bought = await this.verifier.verify(jws).catch(() => {
      throw new BadRequestException("購入を確かめられませんでした");
    });
    if (bought.productId !== UNLOCK_PRODUCT) throw new BadRequestException("違う商品です");
    if (bought.revoked) throw new BadRequestException("この購入は払い戻されています");

    const row = await this.db.transaction(async (tx) => {
      const [me] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!me) throw new UnauthorizedException("ログインしてください");
      const [prev] = await tx
        .select()
        .from(purchases)
        .where(eq(purchases.originalTransactionId, bought.originalTransactionId));
      if (prev && prev.userId !== userId) {
        // 端末の印を元のアカウントへ移す。今のアカウントは使わなくなる
        await tx
          .update(users)
          .set({ sub: `replaced:${userId}` })
          .where(eq(users.id, userId));
        const [owner] = await tx
          .update(users)
          .set({ sub: me.sub })
          .where(eq(users.id, prev.userId))
          .returning();
        return owner;
      }
      if (prev) return me;
      await tx.insert(purchases).values({
        originalTransactionId: bought.originalTransactionId,
        userId,
        productId: bought.productId,
        environment: bought.environment,
      });
      const [after] = await tx
        .update(users)
        .set({ unlocked: true, packs: WELCOME_PACKS, packsDay: packDay(new Date()), tutorialPack: false })
        .where(eq(users.id, userId))
        .returning();
      await tx
        .insert(userCards)
        .values(STARTER.map(([cardId, count]) => ({ userId, cardId, count })))
        .onConflictDoUpdate({
          target: [userCards.userId, userCards.cardId],
          set: { count: sql`greatest(${userCards.count}, excluded.count)` },
        });
      return after;
    });
    if (!row) throw new Error("購入を保存できませんでした");
    return this.auth.session(row);
  }
}
