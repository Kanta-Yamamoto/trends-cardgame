import { autoSacrifice } from "./ai";
import { opponent } from "./engine";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

/**
 * オンライン対戦の持ち時間。
 * - 個人の持ち時間は 1 試合で 10 分。自分のターンのあいだ、最初の 1 秒から減る
 * - 1 ターンは 60 秒まで。過ぎたら自動でターンを終える（差し出しを選ぶ番なら、先に自動で選ぶ）
 * - 持ち時間を使い切ったら、時間切れで負け
 * - 相手の手番の途中で差し出し（フィクサー）を選ぶ番になったら、手番の人の時計は止め、選ぶ人は 15 秒以内に選ぶ。
 *   過ぎたら自動で選ぶ（相手が選ばないせいで手番の人が時間切れにならないように）
 * - ターンが変わったら、新しい手番の人の時計は、その人の画面が相手の手を見せ終える（ready）まで待つ。
 *   待つのは 10 秒まで（画面が知らせてこなくても、そこで動き出す）
 * 時刻はミリ秒（Date.now()）。サーバーが持ち、画面には clockFor で残りの時間だけ渡す。
 */
export const CLOCK = {
  turnMs: 60_000,
  bankMs: 600_000,
  pickMs: 15_000,
  /** 対戦の始めだけ、時計が動き出すまで待つ（部屋に入る・オープニングの間） */
  startGraceMs: 5_000,
  /** ターンが変わったとき、新しい手番の人の画面が相手の手の演出を見せ終えるのを待つ上限 */
  turnGraceMs: 10_000,
} as const;

export interface Clock {
  /** 残りの持ち時間（このターンが始まった時点の値。ターンが終わるたびに、そのターンで使った分を引く） */
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
 * 操作のあとの時計。ターンが変わったら（もう一度ターンを行うときも）、そのターンで使った時間を
 * 前の手番の人の持ち時間から引き、新しいターンの時計を動かす
 */
export function tickClock(clock: Clock, prev: GameState, next: GameState, now: number): Clock {
  if (next.turn === prev.turn || next.winner) return settle(clock, next, now);
  const bank = { ...clock.bank, [prev.active]: Math.max(0, clock.bank[prev.active] - used(clock, now)) };
  return settle({ bank, since: now + CLOCK.turnGraceMs, spent: 0, pickSince: null }, next, now);
}

/**
 * 手番の人の画面が、ターンの始めまでの演出を見せ終えた（turn は通算ターン）。待っている時計をすぐ動かす。
 * 違うターン・手番でない人・もう動いている時計なら、そのまま返す
 */
export function readyClock(
  clock: Clock,
  state: GameState,
  player: PlayerId,
  turn: number,
  now: number,
): Clock {
  if (state.winner || state.active !== player || state.turn !== turn) return clock;
  if (clock.since === null || clock.since <= now) return clock;
  return { ...clock, since: now };
}

/** このターンで使える時間（ターンの 60 秒か、残りの持ち時間の短いほう） */
const turnLimit = (clock: Clock, state: GameState) => Math.min(CLOCK.turnMs, clock.bank[state.active]);

/** 次に時間が切れる時刻（ターンの終わり・持ち時間の切れ・差し出しの待ちの早いほう。決着していれば null） */
export function clockDeadline(clock: Clock, state: GameState): number | null {
  if (state.winner) return null;
  const times: number[] = [];
  if (clock.since !== null) times.push(clock.since + turnLimit(clock, state) - clock.spent);
  if (clock.pickSince !== null) times.push(clock.pickSince + CLOCK.pickMs);
  return times.length ? Math.min(...times) : null;
}

/**
 * 時間が過ぎていたら、サーバーが代わりに行う操作。差し出しの待ちの切れは自動で選ぶ。
 * 持ち時間を使い切ったら負け（timeout）。ターンの 60 秒を過ぎたらターンを終える（差し出しを選ぶ番なら、先に自動で選ぶ）。
 * 何も過ぎていなければ null
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
  if (clock.since === null) return null;
  const u = used(clock, now);
  const player = state.active;
  if (u >= clock.bank[player]) return { type: "timeout", player };
  if (u < CLOCK.turnMs) return null;
  if (state.pending?.waiting.includes(player))
    return { type: "sacrifice", player, slot: autoSacrifice(state, player, catalog) };
  return { type: "endTurn", player };
}

/** 画面に渡す時計（見る人を p1 にそろえる。ms は送った時点の残り） */
export interface ClockView {
  /** 時計が動いている人（止まっていれば null） */
  running: PlayerId | null;
  /** 手番の人のターンの時間の残り */
  turnLeft: number;
  /** 両者の残りの持ち時間（手番の人は、このターンで使っている分も引いた値） */
  bank: Record<PlayerId, number>;
  /** 差し出しを選ぶ残り（手番でない人が選ぶ番のときだけ） */
  pickLeft: number | null;
  /** 時計が動き出すまでの待ち（対戦の始めだけ） */
  holdMs: number;
}

export function clockFor(clock: Clock, state: GameState, now: number, viewer: PlayerId): ClockView {
  const u = used(clock, now);
  const active = state.active;
  const bank = { ...clock.bank, [active]: Math.max(0, clock.bank[active] - u) };
  const flip = (p: PlayerId) => (viewer === "p1" ? p : opponent(p));
  return {
    running: clock.since === null || state.winner ? null : flip(active),
    turnLeft: Math.max(0, turnLimit(clock, state) - u),
    bank: { p1: bank[flip("p1")], p2: bank[flip("p2")] },
    pickLeft: clock.pickSince === null ? null : Math.max(0, clock.pickSince + CLOCK.pickMs - now),
    holdMs: clock.since === null ? 0 : Math.max(0, clock.since - now),
  };
}
