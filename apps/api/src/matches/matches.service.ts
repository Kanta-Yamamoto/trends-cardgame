import { randomInt } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
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
  CLOCK,
  type Clock,
  clockAction,
  createGame,
  type GameEvent,
  type GameState,
  isCustomDeckRef,
  missingCards,
  type PlayerId,
  planMulligan,
  planTurnSearch,
  type RuleCard,
  RuleError,
  rateGame,
  readyClock,
  resolveDeckRef,
  startClock,
  tickClock,
  validateDeck,
} from "@trends/game-core";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { isOpenAccount } from "../auth/access";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { type MatchRatings, type MatchRow, matches, userCards, users } from "../db/schema";

const CATALOG = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
/** 読み間違えやすい文字（0/O・1/I など）を除いた合言葉の文字 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
/** 2 人とも抜けて閉じた対戦に、操作が届いたときの文 */
export const CLOSED_MESSAGE = "この対戦は、2人とも抜けたので閉じました";

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

/**
 * 新しい対戦の状態と時計（先攻は乱数で決める。始めに両者が手札を引き直す）。
 * delayMs は、画面が対戦に入るまでの間（時計はそのあとから動く）
 */
function newGame(p1Deck: string, p2Deck: string, delayMs = 0) {
  const state = createGame({
    decks: { p1: deckCards(p1Deck), p2: deckCards(p2Deck) },
    seed: randomInt(1, 2 ** 31 - 1),
    first: randomInt(2) === 0 ? "p1" : "p2",
    mulligan: true,
  });
  return { state, clock: startClock(state, Date.now() + delayMs) };
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
  /** deck は、構築済みデッキの ID か "custom:…"（自分で組んだデッキ）。友だちの部屋で、まだ準備OKでなければ null */
  players: Record<PlayerId, { id: string; name: string; deck: string | null } | null>;
}

@Injectable()
export class MatchesService {
  /** 同じ部屋の操作を1つずつ順に処理するための列 */
  private queues = new Map<string, Promise<unknown>>();
  /** 待機している CPU のユーザー ID（初めて使うときに users に作る） */
  private cpuId: Promise<string> | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * そのユーザーが対戦で使えるデッキか確かめる。自分で組んだデッキは、買い切りのあとに、持っているカードだけで使える
   * （Web の友だちは全部のカードを使える）
   */
  async assertDeck(userId: string, ref: unknown) {
    const cards = deckCards(ref);
    if (!isCustomDeckRef(ref)) return;
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new BadRequestException("ログインしてください");
    if (isOpenAccount(u.sub)) return;
    if (!u.unlocked) throw new BadRequestException("自分のデッキは買い切りのあとに使えます");
    const rows = await this.db
      .select({ id: userCards.cardId, count: userCards.count })
      .from(userCards)
      .where(eq(userCards.userId, userId));
    const owned = Object.fromEntries(rows.map((r) => [r.id, r.count]));
    if (Object.keys(missingCards(cards, owned)).length > 0)
      throw new BadRequestException("持っていないカードが入っています");
  }

  /** 部屋を作る（作った人が p1）。デッキは部屋の中で選ぶ（deck を渡すのは、古いアプリだけ） */
  async create(userId: string, deck?: unknown) {
    if (deck !== undefined) await this.assertDeck(userId, deck);
    await this.assertFree(userId);
    return this.info(await this.insert({ p1Id: userId, p1Deck: (deck as string | undefined) ?? null }));
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
   * 差し出しを選ぶ番なら自動で選ぶ。引き直しを選ぶ番なら planMulligan で選ぶ。CPU の番でなければ何もしない
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
      if (state.mulligan) {
        if (state.mulligan.waiting.includes(seat))
          action = { type: "mulligan", player: seat, handIndexes: planMulligan(state, seat, CATALOG) };
      } else if (state.pending?.waiting.includes(seat))
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

  /**
   * そのユーザーの、決着していない対戦（いちばん新しいもの）。通信が切れた人が戻るのに使う。
   * 持ち時間の無い古い対戦は数えない（時間切れで決着しないので、ずっと残ってしまう）
   */
  async current(userId: string): Promise<MatchRow | null> {
    const [row] = await this.db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, "playing"),
          isNotNull(matches.clock),
          or(eq(matches.p1Id, userId), eq(matches.p2Id, userId)),
        ),
      )
      .orderBy(desc(matches.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** 決着していない対戦があれば、ほかの部屋には入れない（先にその対戦に戻ってもらう） */
  async assertFree(userId: string) {
    if (await this.current(userId))
      throw new ConflictException("対戦中の部屋があります。先にその対戦に戻ってください");
  }

  /** 2 人とも抜けた対戦を閉じる（決着なし。レーティングは動かない）。対戦中でなければ何もせず null */
  close(code: string) {
    return this.serial(code, async () => {
      const [row] = await this.db
        .update(matches)
        .set({ status: "closed" })
        .where(and(eq(matches.code, code.toUpperCase()), eq(matches.status, "playing")))
        .returning();
      return row ?? null;
    });
  }

  async find(code: string) {
    const [row] = await this.db.select().from(matches).where(eq(matches.code, code.toUpperCase()));
    if (!row) throw new NotFoundException("その合言葉の部屋はありません");
    return row;
  }

  /** 部屋に入る。すでに入っている人は再接続。デッキは入ったあとに選ぶ（deck を渡すのは、古いアプリだけ） */
  join(code: string, userId: string, deck?: unknown) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      if (row.p1Id === userId || row.p2Id === userId) return row;
      if (row.p2Id) throw new ForbiddenException("この部屋はもう2人そろっています");
      if (deck !== undefined) await this.assertDeck(userId, deck);
      await this.assertFree(userId);
      return this.seatRoom(row, {
        p1Id: row.p1Id,
        p1Deck: row.p1Deck,
        p2Id: userId,
        p2Deck: (deck as string | undefined) ?? null,
      });
    });
  }

  /** 友だちの部屋で使うデッキを決める（準備OK）。null で取り消す */
  chooseDeck(code: string, userId: string, deck: unknown) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      const pid = this.seat(row, userId);
      if (row.status !== "waiting") throw new BadRequestException("もう対戦が始まっています");
      if (deck !== null) await this.assertDeck(userId, deck);
      return this.seatRoom(row, {
        p1Id: row.p1Id,
        p2Id: row.p2Id,
        p1Deck: pid === "p1" ? (deck as string | null) : row.p1Deck,
        p2Deck: pid === "p2" ? (deck as string | null) : row.p2Deck,
      });
    });
  }

  /**
   * 始まる前の部屋から抜ける（戻るボタン・通信が切れた）。席と準備OKを空けるので、抜けた人を待たずに済む。
   * 相手がいれば部屋をゆずる。1 人なら席は残す（合言葉を送るあいだに切れても、戻れるように）。
   * 始まったあとの部屋では何もせず null
   */
  leave(code: string, userId: string) {
    return this.serial(code, async () => {
      const row = await this.find(code);
      if (row.status !== "waiting") return null;
      const empty = { p2Id: null, p2Deck: null };
      if (row.p2Id === userId) return this.seatRoom(row, { p1Id: row.p1Id, p1Deck: row.p1Deck, ...empty });
      if (row.p1Id !== userId) return null;
      if (!row.p2Id) return this.seatRoom(row, { p1Id: row.p1Id, p1Deck: null, ...empty });
      return this.seatRoom(row, { p1Id: row.p2Id, p1Deck: row.p2Deck, ...empty });
    });
  }

  /** 部屋の席とデッキを書き換える。2 人ともデッキを決めていれば、ここで対戦を始める */
  private async seatRoom(
    row: MatchRow,
    seats: Pick<MatchRow, "p1Id" | "p1Deck" | "p2Id" | "p2Deck">,
  ): Promise<MatchRow> {
    const { p1Id, p1Deck, p2Id, p2Deck } = seats;
    const start =
      p2Id && p1Deck && p2Deck
        ? { status: "playing", ...newGame(p1Deck, p2Deck, CLOCK.roomCountdownMs) }
        : {};
    const [next] = await this.db
      .update(matches)
      .set({ p1Id, p1Deck, p2Id, p2Deck, ...start })
      .where(eq(matches.id, row.id))
      .returning();
    return next as MatchRow;
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
      if (row.status === "closed") throw new RuleError("closed", CLOSED_MESSAGE);
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

  /**
   * 手番の人の画面が、ターンの始めまでの演出を見せ終えた。待っている時計をすぐ動かす。
   * 時計が変わったら、保存した部屋を返す（変わらなければ null）
   */
  ready(code: string, userId: string, turn: number) {
    return this.serial(code, async (): Promise<MatchRow | null> => {
      const row = await this.find(code);
      if (!row.state || !row.clock || row.status !== "playing") return null;
      const clock = readyClock(row.clock, row.state, this.seat(row, userId), turn, Date.now());
      if (clock === row.clock) return null;
      const [next] = await this.db.update(matches).set({ clock }).where(eq(matches.id, row.id)).returning();
      return next ?? null;
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
    for (let i = 0; i < 4 && cur.status === "playing" && cur.state && cur.clock; i++) {
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
      return u ? { id: u.id, name: u.name, deck: typeof deck === "string" ? deck : null } : null;
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
