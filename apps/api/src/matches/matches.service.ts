import { randomInt } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CARDS, CPU_DECKS, DECKS } from "@trends/cards";
import {
  type Action,
  actionFrom,
  applyAction,
  autoSacrifice,
  type Clock,
  clockAction,
  createGame,
  type GameEvent,
  type GameState,
  type PlayerId,
  planTurnSearch,
  type RuleCard,
  RuleError,
  rateGame,
  resolveDeckRef,
  startClock,
  tickClock,
  validateDeck,
} from "@trends/game-core";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { type MatchRatings, type MatchRow, matches, users } from "../db/schema";

const CATALOG = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
/** 読み間違えやすい文字（0/O・1/I など）を除いた合言葉の文字 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

/** 対戦を1手進めた結果（両者に送る） */
export interface Step {
  row: MatchRow;
  action: Action;
  events: GameEvent[];
  state: GameState;
}

/** ランダムマッチで組まれた1人分 */
export interface Pairing {
  userId: string;
  deck: string;
}

/** 新しい対戦の状態と時計（先攻は乱数で決める） */
function newGame(p1Deck: string, p2Deck: string) {
  const state = createGame({
    decks: { p1: deckCards(p1Deck), p2: deckCards(p2Deck) },
    seed: randomInt(1, 2 ** 31 - 1),
    first: randomInt(2) === 0 ? "p1" : "p2",
  });
  return { state, clock: startClock(state, Date.now()) };
}

/**
 * デッキの指し方（構築済みの ID か "custom:…"）からカードの並びを得る。決まりを守っていなければ BadRequest。
 * 自分で組んだデッキも、サーバー側で 20枚・2枚まで・属性1つ＋ニュートラル・闇堕ちを持つカードは2枚までを確かめる
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
  /** friend（合言葉の部屋）/ random（ランダムマッチ）/ cpu（ランダムマッチで待機している CPU と） */
  kind: string;
  /** deck は、構築済みデッキの ID か "custom:…"（自分で組んだデッキ） */
  players: Record<PlayerId, { id: string; name: string; deck: string } | null>;
}

@Injectable()
export class MatchesService {
  /** 同じ部屋の操作を1つずつ順に処理するための列 */
  private queues = new Map<string, Promise<unknown>>();
  /** 待機している CPU のユーザー ID（初めて使うときに users に作る） */
  private cpuId: Promise<string> | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  /** 部屋を作る（作った人が p1） */
  async create(userId: string, deck: unknown) {
    deckCards(deck);
    return this.info(await this.insert({ p1Id: userId, p1Deck: deck as string }));
  }

  /** ランダムマッチで組まれた 2 人の対戦を始める（レーティングが動く） */
  createRandom(a: Pairing, b: Pairing) {
    return this.createMatch("random", a, b);
  }

  /** 2 人の席を乱数で決めて、始まった対戦を作る */
  private createMatch(kind: "random" | "cpu", a: Pairing, b: Pairing) {
    const [p1, p2] = randomInt(2) === 0 ? [a, b] : [b, a];
    return this.insert({
      kind,
      status: "playing",
      p1Id: p1.userId,
      p1Deck: p1.deck,
      p2Id: p2.userId,
      p2Deck: p2.deck,
      ...newGame(p1.deck, p2.deck),
    });
  }

  /** CPU のユーザー（ランダムマッチで人と組めなかった人の相手。レーティングは動かないのでランキングにも載らない） */
  cpuUser(): Promise<string> {
    this.cpuId ??= this.db
      .insert(users)
      .values({ sub: "cpu:standby", name: "CPU" })
      .onConflictDoUpdate({ target: users.sub, set: { name: "CPU" } })
      .returning()
      .then(([u]) => {
        if (!u) throw new Error("CPU のユーザーを作れませんでした");
        return u.id;
      })
      .catch((e) => {
        this.cpuId = null;
        throw e;
      });
    return this.cpuId;
  }

  /** 待機している CPU と対戦を始める（CPU のデッキは CPU_DECKS から 1 つ。レーティングは動かない） */
  async createCpu(human: Pairing) {
    const deck = CPU_DECKS[randomInt(CPU_DECKS.length)];
    if (!deck) throw new Error("CPU のデッキがありません");
    return this.createMatch("cpu", human, { userId: await this.cpuUser(), deck });
  }

  /** その部屋の CPU の席（CPU との対戦でなければ null） */
  async cpuSeat(row: MatchRow): Promise<PlayerId | null> {
    if (row.kind !== "cpu") return null;
    const id = await this.cpuUser();
    return row.p1Id === id ? "p1" : row.p2Id === id ? "p2" : null;
  }

  /**
   * CPU の番なら 1 手進める（先読みする CPU の planTurnSearch で、今の盤面からいちばん良い手順の最初の 1 手）。
   * 差し出しを選ぶ番なら自動で選ぶ。CPU の番でなければ何もしない
   */
  cpuStep(code: string) {
    return this.serial(code, async (): Promise<Step[]> => {
      const row = await this.find(code);
      const seat = await this.cpuSeat(row);
      if (!seat || !row.state || row.status !== "playing") return [];
      const now = Date.now();
      const steps = await this.catchUp(row, now);
      const cur = steps.at(-1)?.row ?? row;
      const state = cur.state as GameState;
      if (state.winner) return steps;
      let action: Action | null = null;
      if (state.pending?.waiting.includes(seat))
        action = { type: "sacrifice", player: seat, slot: autoSacrifice(state, seat, CATALOG) };
      else if (state.active === seat && !state.pending)
        action = planTurnSearch(state, seat, CATALOG)[0] ?? { type: "endTurn", player: seat };
      if (!action) return steps;
      try {
        steps.push(await this.advance(cur, action, now));
      } catch (e) {
        // 読み違えた手は、ターンを終えて次に進める
        if (!(e instanceof RuleError) || action.type === "endTurn") throw e;
        steps.push(await this.advance(cur, { type: "endTurn", player: seat }, now));
      }
      return steps;
    });
  }

  /** 合言葉を付けて部屋を作る（まれに重なったら作り直す） */
  private async insert(values: Omit<typeof matches.$inferInsert, "code">) {
    for (let i = 0; i < 5; i++) {
      const [row] = await this.db
        .insert(matches)
        .values({ ...values, code: newCode() })
        .onConflictDoNothing()
        .returning();
      if (row) return row;
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
      deckCards(deck);
      const { state, clock } = newGame(row.p1Deck, deck as string);
      const [next] = await this.db
        .update(matches)
        .set({ p2Id: userId, p2Deck: deck as string, status: "playing", state, clock })
        .where(eq(matches.id, row.id))
        .returning();
      return next as MatchRow;
    });
  }

  /**
   * 操作を1つ進める（反則なら RuleError）。時間が過ぎていたら、先に時間切れの処理（自動の差し出し・時間切れ負け）を進める。
   * そのあと操作が反則になったときは、進めた手と一緒にエラー文を返す（進めた手も両者に送るため）
   */
  act(code: string, userId: string, action: Action) {
    return this.serial(code, async (): Promise<{ steps: Step[]; error?: string }> => {
      if (action.type === "timeout") throw new BadRequestException("その操作はできません");
      const row = await this.find(code);
      const pid = this.seat(row, userId);
      if (!row.state) throw new BadRequestException("まだ対戦が始まっていません");
      const now = Date.now();
      const steps = await this.catchUp(row, now);
      const last = steps.at(-1)?.row ?? row;
      try {
        steps.push(await this.advance(last, actionFrom(action, pid), now));
      } catch (e) {
        if (steps.length && e instanceof RuleError) return { steps, error: e.message };
        throw e;
      }
      return { steps };
    });
  }

  /** 時間が過ぎていたら、時間切れの処理を進める（タイマーと、部屋に入り直したときに呼ぶ） */
  tick(code: string) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      const steps = await this.catchUp(row, Date.now());
      return { steps, row: steps.at(-1)?.row ?? row };
    });
  }

  /** 時計で決着を待っている対戦（サーバーが起動したときに、タイマーを掛け直す） */
  playing() {
    return this.db
      .select()
      .from(matches)
      .where(and(eq(matches.status, "playing"), isNotNull(matches.clock)));
  }

  /** 過ぎた時間の分だけ、サーバーが代わりに操作する */
  private async catchUp(row: MatchRow, now: number): Promise<Step[]> {
    const steps: Step[] = [];
    let cur = row;
    // 自動の差し出しのあと、手番の人も時間切れ…と続くことがあるので、何回か見る
    for (let i = 0; i < 4 && cur.state && cur.clock; i++) {
      const due = clockAction(cur.clock, cur.state, now, CATALOG);
      if (!due) break;
      const step = await this.advance(cur, due, now);
      steps.push(step);
      cur = step.row;
    }
    return steps;
  }

  /** 1手進めて保存する。決着したら、ランダムマッチならレーティングを動かす */
  private async advance(row: MatchRow, action: Action, now: number): Promise<Step> {
    const prev = row.state as GameState;
    const { state, events } = applyAction(prev, action, CATALOG);
    const clock: Clock | null = row.clock ? tickClock(row.clock, prev, state, now) : null;
    const next = state.winner
      ? await this.finish(row, state, clock)
      : (
          await this.db
            .update(matches)
            .set({ state, clock, status: "playing" })
            .where(eq(matches.id, row.id))
            .returning()
        )[0];
    return { row: next as MatchRow, action, events: events as GameEvent[], state: state as GameState };
  }

  /** 決着を保存する。ランダムマッチなら、同じ取引の中で両者のレーティングを動かす（1 試合で 1 回だけ） */
  private finish(row: MatchRow, state: GameState, clock: Clock | null) {
    const winnerId = state.winner === "p1" ? row.p1Id : row.p2Id;
    return this.db.transaction(async (tx) => {
      const [done] = await tx
        .update(matches)
        .set({ state, clock, status: "finished", winnerId })
        .where(and(eq(matches.id, row.id), eq(matches.status, "playing")))
        .returning();
      if (!done) throw new RuleError("game_over", "対戦は終了しています");
      const loserId = winnerId === row.p1Id ? row.p2Id : row.p1Id;
      if (done.kind !== "random" || !winnerId || !loserId || winnerId === loserId) return done;
      const people = await tx
        .select({ id: users.id, rating: users.rating })
        .from(users)
        .where(inArray(users.id, [winnerId, loserId]))
        .for("update");
      const before = (id: string) => people.find((p) => p.id === id)?.rating ?? 1500;
      const r = rateGame(before(winnerId), before(loserId));
      const after = (id: string) => (id === winnerId ? r.winner : r.loser);
      for (const id of [winnerId, loserId])
        await tx
          .update(users)
          .set({
            rating: after(id),
            ratedGames: sql`${users.ratedGames} + 1`,
            wins: sql`${users.wins} + ${id === winnerId ? 1 : 0}`,
          })
          .where(eq(users.id, id));
      const p2Id = row.p2Id as string;
      const ratings: MatchRatings = {
        p1: { before: before(row.p1Id), after: after(row.p1Id) },
        p2: { before: before(p2Id), after: after(p2Id) },
      };
      const [rated] = await tx.update(matches).set({ ratings }).where(eq(matches.id, row.id)).returning();
      return rated as MatchRow;
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
      kind: row.kind,
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
