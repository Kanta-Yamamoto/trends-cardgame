import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { users } from "../db/schema";

/** ランキングを作り直す間隔（時計の 10 分ごとの区切り。0 分・10 分・20 分…に作り直す） */
export const RANKING_PERIOD_MS = 10 * 60_000;
/** 返す上位の人数 */
export const RANKING_TOP = 100;

export interface RankEntry {
  rank: number;
  id: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
}

interface Snapshot {
  /** 集計した時刻 */
  at: number;
  entries: RankEntry[];
}

/** ランキングを並べる（レーティングの高い順。同じ値は同じ順位で、次の順位はその人数だけ飛ぶ） */
export function rankEntries(rows: Omit<RankEntry, "rank">[]): RankEntry[] {
  const sorted = [...rows].sort(
    (a, b) => b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name),
  );
  let rank = 0;
  return sorted.map((r, i) => {
    if (sorted[i - 1]?.rating !== r.rating) rank = i + 1;
    return { ...r, rank };
  });
}

/**
 * ランキング。1 試合ごとに並べ直さず、10 分ごとの区切りで集計したものを使い回す（DB への負担を抑え、順位が毎回ちらつかないように）。
 * 自分のレーティングは、いつでも今の値を返す
 */
@Injectable()
export class RankingService {
  private snapshot: Snapshot | null = null;
  private building: Promise<Snapshot> | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  /** 今の区切りの集計（古ければ作り直す） */
  async current(now = Date.now()): Promise<Snapshot> {
    const s = this.snapshot;
    if (s && Math.floor(s.at / RANKING_PERIOD_MS) === Math.floor(now / RANKING_PERIOD_MS)) return s;
    this.building ??= this.build(now).finally(() => {
      this.building = null;
    });
    return this.building;
  }

  /** 手元の集計を捨てる（テスト用） */
  reset() {
    this.snapshot = null;
  }

  private async build(now: number): Promise<Snapshot> {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        rating: users.rating,
        games: users.ratedGames,
        wins: users.wins,
        nameSet: users.nameSet,
      })
      .from(users)
      .where(gt(users.ratedGames, 0))
      .orderBy(desc(users.rating));
    // 名前をまだ決めていない人（10月27日より前に Google の名前のまま遊んだ人）は、名前を出さない
    const named = rows.map(({ nameSet, ...r }) => ({ ...r, name: nameSet ? r.name : "プレイヤー" }));
    this.snapshot = { at: now, entries: rankEntries(named) };
    return this.snapshot;
  }

  /** そのユーザーの今のレーティング */
  async ratingOf(userId: string) {
    const [u] = await this.db
      .select({ rating: users.rating, games: users.ratedGames, wins: users.wins })
      .from(users)
      .where(eq(users.id, userId));
    return u ?? { rating: 1500, games: 0, wins: 0 };
  }

  /** 画面に出すランキング（上位と、集計の中での自分の順位） */
  async board(userId: string) {
    const s = await this.current();
    const mine = s.entries.find((e) => e.id === userId);
    const strip = ({ id: _id, ...e }: RankEntry) => e;
    return {
      updatedAt: new Date(s.at).toISOString(),
      nextAt: new Date((Math.floor(s.at / RANKING_PERIOD_MS) + 1) * RANKING_PERIOD_MS).toISOString(),
      players: s.entries.slice(0, RANKING_TOP).map((e) => ({ ...strip(e), me: e.id === userId })),
      me: { ...(await this.ratingOf(userId)), rank: mine?.rank ?? null, ranked: s.entries.length },
    };
  }
}
