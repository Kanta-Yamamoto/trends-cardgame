import { autoSacrifice } from "./ai";
import { opponent } from "./engine";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

/**
 * オンライン対戦の持ち時間。
 * - 毎ターン、まず 30 秒（ターンの時間）。使い切ると、個人の持ち時間（1 試合で 5 分）から減る
 * - ターンの時間と持ち時間をどちらも使い切ったら、時間切れで負け
 * - 相手の手番の途中で差し出し（フィクサー）を選ぶ番になったら、手番の人の時計は止め、選ぶ人は 15 秒以内に選ぶ。
 *   過ぎたら自動で選ぶ（相手が選ばないせいで手番の人が時間切れにならないように）
 * 時刻はミリ秒（Date.now()）。サーバーが持ち、画面には clockFor で残りの時間だけ渡す。
 */
export const CLOCK = {
  turnMs: 30_000,
  bankMs: 300_000,
  pickMs: 15_000,
  /** 対戦の始めだけ、時計が動き出すまで待つ（部屋に入る・オープニングの間） */
  startGraceMs: 5_000,
} as const;

export interface Clock {
  /** 残りの持ち時間（ターンの時間を超えて使った分を、ターンが終わるたびに引く） */
  bank: Record<PlayerId, number>;
  /** 手番の人の時計が動き出した時刻。止まっているあいだは null */
  since: number | null;
  /** このターンで、since より前に使った時間 */
  spent: number;
  /** 相手の差し出しを待ち始めた時刻（手番でない人が選ぶ番のときだけ） */
  pickSince: number | null;
}

/** 手番の人の時計を止めるか（手番でない人だけが差し出しを選ぶ番） */
const paused = (state: GameState) => !!state.pending && !state.pending.waiting.includes(state.active);
/** 手番でない人が差し出しを選ぶ番か */
const foePicking = (state: GameState) => !!state.pending?.waiting.includes(opponent(state.active));

/** このターンで使った時間 */
const used = (clock: Clock, now: number) =>
  clock.spent + (clock.since === null ? 0 : Math.max(0, now - clock.since));

/** 対戦の始めの時計 */
export function startClock(state: GameState, now: number): Clock {
  return settle(
    {
      bank: { p1: CLOCK.bankMs, p2: CLOCK.bankMs },
      since: now + CLOCK.startGraceMs,
      spent: 0,
      pickSince: null,
    },
    state,
    now,
  );
}

/** 止める・動かす・差し出しの待ちを、今の state に合わせる */
function settle(clock: Clock, state: GameState, now: number): Clock {
  const c = { ...clock, bank: { ...clock.bank } };
  if (state.winner) {
    c.spent = used(c, now);
    c.since = null;
    c.pickSince = null;
    return c;
  }
  if (paused(state) && c.since !== null) {
    c.spent = used(c, now);
    c.since = null;
  } else if (!paused(state) && c.since === null) c.since = now;
  if (foePicking(state)) c.pickSince ??= now;
  else c.pickSince = null;
  return c;
}

/**
 * 操作のあとの時計。ターンが変わったら（もう一度ターンを行うときも）、ターンの時間を超えた分を
 * 前の手番の人の持ち時間から引き、新しいターンの時計を動かす
 */
export function tickClock(clock: Clock, prev: GameState, next: GameState, now: number): Clock {
  if (next.turn === prev.turn || next.winner) return settle(clock, next, now);
  const over = Math.max(0, used(clock, now) - CLOCK.turnMs);
  const bank = { ...clock.bank, [prev.active]: Math.max(0, clock.bank[prev.active] - over) };
  return settle({ bank, since: now, spent: 0, pickSince: null }, next, now);
}

/** 次に時間切れが起きる時刻（決着していれば null） */
export function clockDeadline(clock: Clock, state: GameState): number | null {
  if (state.winner) return null;
  const times: number[] = [];
  if (clock.since !== null) times.push(clock.since + CLOCK.turnMs + clock.bank[state.active] - clock.spent);
  if (clock.pickSince !== null) times.push(clock.pickSince + CLOCK.pickMs);
  return times.length ? Math.min(...times) : null;
}

/**
 * 時間が過ぎていたら、サーバーが代わりに行う操作。差し出しの時間切れは自動で選び、
 * ターンの時間切れは負け（timeout）。何も過ぎていなければ null
 */
export function clockAction(
  clock: Clock,
  state: GameState,
  now: number,
  catalog: Record<string, RuleCard>,
): Action | null {
  if (state.winner) return null;
  if (clock.pickSince !== null && now >= clock.pickSince + CLOCK.pickMs) {
    const player = opponent(state.active);
    return { type: "sacrifice", player, slot: autoSacrifice(state, player, catalog) };
  }
  if (clock.since !== null && now >= clock.since + CLOCK.turnMs + clock.bank[state.active] - clock.spent)
    return { type: "timeout", player: state.active };
  return null;
}

/** 画面に渡す時計（見る人を p1 にそろえる。ms は送った時点の残り） */
export interface ClockView {
  /** 時計が動いている人（止まっていれば null） */
  running: PlayerId | null;
  /** 手番の人のターンの時間の残り */
  turnLeft: number;
  /** 両者の残りの持ち時間（手番の人は、今ターンの時間を超えて使っている分も引いた値） */
  bank: Record<PlayerId, number>;
  /** 差し出しを選ぶ残り（手番でない人が選ぶ番のときだけ） */
  pickLeft: number | null;
  /** 時計が動き出すまでの待ち（対戦の始めだけ） */
  holdMs: number;
}

export function clockFor(clock: Clock, state: GameState, now: number, viewer: PlayerId): ClockView {
  const u = used(clock, now);
  const active = state.active;
  const bank = { ...clock.bank, [active]: Math.max(0, clock.bank[active] - Math.max(0, u - CLOCK.turnMs)) };
  const flip = (p: PlayerId) => (viewer === "p1" ? p : opponent(p));
  return {
    running: clock.since === null || state.winner ? null : flip(active),
    turnLeft: Math.max(0, CLOCK.turnMs - u),
    bank: { p1: bank[flip("p1")], p2: bank[flip("p2")] },
    pickLeft: clock.pickSince === null ? null : Math.max(0, clock.pickSince + CLOCK.pickMs - now),
    holdMs: clock.since === null ? 0 : Math.max(0, clock.since - now),
  };
}
