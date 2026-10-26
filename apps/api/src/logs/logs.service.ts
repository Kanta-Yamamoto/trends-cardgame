import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { CpuGameRecord } from "@trends/game-core";
import { asc, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { cpuGames, users } from "../db/schema";

/** 1つの記録の手の数・考えた中身の数の上限（おかしな大きさのものを断る） */
const MAX_MOVES = 3000;
const MAX_THOUGHTS = 600;
/** 一度に取り出せる数 */
export const MAX_LIST = 100;

const isSide = (x: unknown) => x === "p1" || x === "p2";

/** 送られてきた CPU 対戦の記録を確かめる。形がおかしければ BadRequest */
export function parseCpuGame(body: unknown): { client: string; record: CpuGameRecord } {
  const b = body as { client?: unknown; record?: Partial<CpuGameRecord> } | null;
  const r = b?.record;
  if (typeof b?.client !== "string" || b.client.length === 0 || b.client.length > 64)
    throw new BadRequestException("端末の印がありません");
  if (
    r?.v !== 1 ||
    typeof r.cards !== "string" ||
    !isSide(r.human) ||
    !isSide(r.cpu) ||
    r.human === r.cpu ||
    typeof r.humanDeck?.ref !== "string" ||
    typeof r.cpuDeck?.ref !== "string" ||
    typeof r.initial !== "object" ||
    r.initial === null ||
    !Array.isArray(r.moves) ||
    r.moves.length > MAX_MOVES ||
    !Array.isArray(r.thoughts) ||
    r.thoughts.length > MAX_THOUGHTS ||
    typeof r.end?.turn !== "number" ||
    !(r.end.winner === null || isSide(r.end.winner))
  )
    throw new BadRequestException("記録の形がおかしいです");
  return { client: b.client, record: r as CpuGameRecord };
}

@Injectable()
export class LogsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** CPU 対戦の記録を、遊んだアカウントにひも付けて残す */
  async addCpuGame(userId: string, body: unknown) {
    const { client, record } = parseCpuGame(body);
    const winner = record.end.winner === null ? null : record.end.winner === record.human ? "human" : "cpu";
    const [row] = await this.db
      .insert(cpuGames)
      .values({
        userId,
        client,
        cards: record.cards.slice(0, 32),
        humanDeck: record.humanDeck.ref.slice(0, 64),
        cpuDeck: record.cpuDeck.ref.slice(0, 64),
        winner,
        turns: Math.max(0, Math.floor(record.end.turn)),
        record,
      })
      .returning({ id: cpuGames.id });
    return { id: row?.id ?? null };
  }

  /** after（ISO の時刻）より後に残した記録を、古い順に limit 件まで */
  async listCpuGames(after?: string, limit?: string) {
    const since = after ? new Date(after) : null;
    if (since && Number.isNaN(since.getTime()))
      throw new BadRequestException("after は時刻で指定してください");
    const n = Math.min(MAX_LIST, Math.max(1, Number(limit) || MAX_LIST));
    const rows = await this.db
      .select({ game: cpuGames, userName: users.name })
      .from(cpuGames)
      .leftJoin(users, eq(users.id, cpuGames.userId))
      .where(since ? gt(cpuGames.createdAt, since) : undefined)
      .orderBy(asc(cpuGames.createdAt))
      .limit(n);
    return {
      games: rows.map(({ game: r, userName }) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        /** 遊んだアカウント（10月26日より前の記録は null） */
        user: r.userId ? { id: r.userId, name: userName } : null,
        client: r.client,
        cards: r.cards,
        humanDeck: r.humanDeck,
        cpuDeck: r.cpuDeck,
        winner: r.winner,
        turns: r.turns,
        record: r.record,
      })),
    };
  }
}
