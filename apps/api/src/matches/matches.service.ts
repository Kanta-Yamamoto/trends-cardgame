import { randomInt } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CARDS, DECKS } from "@trends/cards";
import {
  type Action,
  actionFrom,
  applyAction,
  createGame,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RuleCard,
  resolveDeckRef,
  validateDeck,
} from "@trends/game-core";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { type MatchRow, matches, users } from "../db/schema";

const CATALOG = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
/** 読み間違えやすい文字（0/O・1/I など）を除いた合言葉の文字 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * デッキの指し方（構築済みの ID か "custom:…"）からカードの並びを得る。決まりを守っていなければ BadRequest。
 * 自分で組んだデッキも、サーバー側で 30枚・3枚まで・属性1つ＋共通を確かめる
 */
export function deckCards(ref: unknown): string[] {
  const cards = resolveDeckRef(ref, DECKS);
  if (!cards) throw new BadRequestException("デッキを選んでください");
  const errors = validateDeck(cards, CATALOG);
  if (errors.length > 0)
    throw new BadRequestException(`デッキの決まりを守っていません：${errors.join("、")}`);
  return cards;
}

export interface MatchInfo {
  code: string;
  status: string;
  /** deck は、構築済みデッキの ID か "custom:…"（自分で組んだデッキ） */
  players: Record<PlayerId, { id: string; name: string; deck: string } | null>;
}

@Injectable()
export class MatchesService {
  /** 同じ部屋の操作を1つずつ順に処理するための列 */
  private queues = new Map<string, Promise<unknown>>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** 部屋を作る（作った人が p1） */
  async create(userId: string, deck: unknown) {
    deckCards(deck);
    for (let i = 0; i < 5; i++) {
      const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
      const [row] = await this.db
        .insert(matches)
        .values({ code, p1Id: userId, p1Deck: deck as string })
        .onConflictDoNothing()
        .returning();
      if (row) return this.info(row);
    }
    throw new Error("合言葉を作れませんでした");
  }

  async find(code: string) {
    const [row] = await this.db.select().from(matches).where(eq(matches.code, code.toUpperCase()));
    if (!row) throw new NotFoundException("その合言葉の部屋はありません");
    return row;
  }

  /** 部屋に入る。2人目ならデッキを受け取って対戦を始める。すでに入っている人は再接続 */
  join(code: string, userId: string, deck: unknown) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      if (row.p1Id === userId || row.p2Id === userId) return row;
      if (row.p2Id) throw new ForbiddenException("この部屋はもう2人そろっています");
      const p2Cards = deckCards(deck);
      const seed = randomInt(1, 2 ** 31 - 1);
      const state = createGame({
        decks: { p1: deckCards(row.p1Deck), p2: p2Cards },
        seed,
        first: randomInt(2) === 0 ? "p1" : "p2",
      });
      const [next] = await this.db
        .update(matches)
        .set({ p2Id: userId, p2Deck: deck as string, status: "playing", state })
        .where(eq(matches.id, row.id))
        .returning();
      return next as MatchRow;
    });
  }

  /** 操作を1つ進める（反則なら RuleError） */
  act(code: string, userId: string, action: Action) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      const pid = this.seat(row, userId);
      if (!row.state) throw new BadRequestException("まだ対戦が始まっていません");
      const real = actionFrom(action, pid);
      const { state, events } = applyAction(row.state, real, CATALOG);
      const winnerId = state.winner ? (state.winner === "p1" ? row.p1Id : row.p2Id) : null;
      const [next] = await this.db
        .update(matches)
        .set({ state, status: state.winner ? "finished" : "playing", winnerId })
        .where(eq(matches.id, row.id))
        .returning();
      return {
        row: next as MatchRow,
        action: real,
        events: events as GameEvent[],
        state: state as GameState,
      };
    });
  }

  /** そのユーザーの席（p1 / p2）。参加者でなければエラー */
  seat(row: MatchRow, userId: string): PlayerId {
    if (row.p1Id === userId) return "p1";
    if (row.p2Id === userId) return "p2";
    throw new ForbiddenException("この部屋の参加者ではありません");
  }

  async info(row: MatchRow): Promise<MatchInfo> {
    const ids = [row.p1Id, row.p2Id].filter((x): x is string => !!x);
    const people = await this.db.select().from(users).where(inArray(users.id, ids));
    const who = (id: string | null, deck: string | null) => {
      const u = people.find((p) => p.id === id);
      // 前に作られた部屋は、もう無い構築済みデッキの ID を持っていることがある。表示と再接続のために、文字列ならそのまま返す
      return u && typeof deck === "string" ? { id: u.id, name: u.name, deck } : null;
    };
    return {
      code: row.code,
      status: row.status,
      players: { p1: who(row.p1Id, row.p1Deck), p2: who(row.p2Id, row.p2Deck) },
    };
  }

  private serial<T>(code: string, job: () => Promise<T>): Promise<T> {
    const key = code.toUpperCase();
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(job, job);
    const tail = next.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return next;
  }
}
