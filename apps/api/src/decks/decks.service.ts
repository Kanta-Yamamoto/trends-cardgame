import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { isUnlocked } from "../auth/access";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { type SavedDeck, userDecks, users } from "../db/schema";

/** 1人が保存できるデッキの数と、1つのデッキのカードの数・名前の長さの上限（決まりの検査は対戦のときに行う） */
export const MAX_DECKS = 50;
const MAX_CARDS = 60;
const MAX_NAME = 40;

/**
 * 送られてきたデッキの一覧を確かめて、保存する形にそろえる。形がおかしければ BadRequest。
 * デッキの決まり（20枚・2枚まで など）はここでは見ない（前に組んだ、決まりを守れていないデッキも残せるように）
 */
export function parseDecks(body: unknown): SavedDeck[] {
  const list = (body as { decks?: unknown } | null)?.decks;
  if (!Array.isArray(list)) throw new BadRequestException("デッキの一覧を送ってください");
  if (list.length > MAX_DECKS) throw new BadRequestException(`デッキは ${MAX_DECKS} 個までです`);
  const seen = new Set<string>();
  return list.map((d) => {
    const x = d as Partial<SavedDeck> | null;
    if (
      !x ||
      typeof x.id !== "string" ||
      x.id.length === 0 ||
      x.id.length > 64 ||
      typeof x.name !== "string" ||
      !Array.isArray(x.cards) ||
      x.cards.length > MAX_CARDS ||
      !x.cards.every((c) => typeof c === "string" && c.length > 0 && c.length <= 32)
    )
      throw new BadRequestException("デッキの形がおかしいです");
    if (seen.has(x.id)) throw new BadRequestException("同じ ID のデッキがあります");
    seen.add(x.id);
    return {
      id: x.id,
      name: x.name.slice(0, MAX_NAME),
      cards: [...x.cards],
      updated: typeof x.updated === "number" && Number.isFinite(x.updated) ? x.updated : Date.now(),
    };
  });
}

@Injectable()
export class DecksService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** ユーザーの保存したデッキ（まだ無ければ空） */
  async list(userId: string) {
    const [row] = await this.db.select().from(userDecks).where(eq(userDecks.userId, userId));
    return { decks: row?.decks ?? [], updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  /** デッキの一覧をまるごと置き換える */
  async replace(userId: string, body: unknown) {
    const decks = parseDecks(body);
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new UnauthorizedException("ログインしてください");
    if (decks.length > 0 && !isUnlocked(u)) throw new ForbiddenException("デッキは買い切りのあとに組めます");
    const [row] = await this.db
      .insert(userDecks)
      .values({ userId, decks })
      .onConflictDoUpdate({ target: userDecks.userId, set: { decks, updatedAt: new Date() } })
      .returning();
    return { decks: row?.decks ?? decks, updatedAt: row?.updatedAt.toISOString() ?? null };
  }
}
