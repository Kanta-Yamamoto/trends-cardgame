import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { CLOCK, clockAction, clockDeadline, clockFor, readyClock, startClock, tickClock } from "./clock";
import { applyAction, createGame } from "./engine";
import { expectedScore, RATING, rateGame } from "./rating";
import type { GameState, RuleCard } from "./types";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const game = () => createGame({ decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol }, seed: 5, first: "p1" });
const T0 = 1_000_000;
/** 時計が動き出す時刻（始めの待ちのあと） */
const GO = T0 + CLOCK.startGraceMs;
const endTurn = (s: GameState) => applyAction(s, { type: "endTurn", player: s.active }, catalog).state;

describe("時計（1 ターン 60 秒）", () => {
  it("始めは待ちのあとに時計が動き、1 ターンは 60 秒まで。過ぎたらサーバーがターンを終える", () => {
    const s = game();
    const c = startClock(s, T0);
    expect(clockDeadline(c, s)).toBe(GO + CLOCK.turnMs);
    expect(clockAction(c, s, GO + CLOCK.turnMs - 1, catalog)).toBeNull();
    expect(clockAction(c, s, GO + CLOCK.turnMs, catalog)).toEqual({ type: "endTurn", player: "p1" });
    // 待ちのあいだは減らない
    expect(clockFor(c, s, T0 + 1000, "p1")).toMatchObject({ turnLeft: CLOCK.turnMs, holdMs: 4000 });
  });

  it("持ち時間は無い：前のターンに長く使っても、どのターンも 60 秒ある", () => {
    let s = game();
    let c = startClock(s, T0);
    let next = endTurn(s);
    // p1 は 59 秒使ってターンを終えた
    c = tickClock(c, s, next, GO + 59_000);
    s = next;
    c = readyClock(c, s, "p2", s.turn, GO + 59_000);
    next = endTurn(s);
    c = tickClock(c, s, next, GO + 118_000);
    s = next;
    c = readyClock(c, s, "p1", s.turn, GO + 118_000);
    // p1 の次のターンも 60 秒
    expect(clockDeadline(c, s)).toBe(GO + 118_000 + CLOCK.turnMs);
    expect(clockFor(c, s, GO + 118_000, "p1").turnLeft).toBe(CLOCK.turnMs);
  });

  it("ターンが変わったら、新しい手番の人の画面が見せ終える（ready）まで、10 秒を上限に時計を待たせる", () => {
    const s = game();
    const c0 = startClock(s, T0);
    const next = endTurn(s);
    const c = tickClock(c0, s, next, GO + 3_000);
    // 待っているあいだは減らない（p2 から見ると、自分が p1）
    expect(clockFor(c, next, GO + 5_000, "p2")).toMatchObject({
      running: "p1",
      turnLeft: CLOCK.turnMs,
      holdMs: CLOCK.turnGraceMs - 2_000,
    });
    // 知らせが来なくても、上限を過ぎたら動き出す
    expect(clockDeadline(c, next)).toBe(GO + 3_000 + CLOCK.turnGraceMs + CLOCK.turnMs);
    // 手番の人の画面が見せ終えたら、そこから動く
    const r = readyClock(c, next, "p2", next.turn, GO + 6_000);
    expect(r.since).toBe(GO + 6_000);
    expect(clockDeadline(r, next)).toBe(GO + 6_000 + CLOCK.turnMs);
    // 手番でない人・違うターン・もう動いている時計の知らせは効かない
    expect(readyClock(c, next, "p1", next.turn, GO + 6_000)).toBe(c);
    expect(readyClock(c, next, "p2", next.turn + 1, GO + 6_000)).toBe(c);
    expect(readyClock(r, next, "p2", next.turn, GO + 7_000)).toBe(r);
  });

  it("持ち時間を使い切っても負けにならない（時間切れの負けは無い）。ターンは 60 秒まで待つ", () => {
    const s = game();
    const c = { ...startClock(s, T0), bank: { p1: 10_000, p2: CLOCK.bankMs } };
    expect(clockDeadline(c, s)).toBe(GO + CLOCK.turnMs);
    expect(clockFor(c, s, GO + 4_000, "p1").turnLeft).toBe(CLOCK.turnMs - 4_000);
    expect(clockAction(c, s, GO + 10_000, catalog)).toBeNull();
    expect(clockAction(c, s, GO + CLOCK.turnMs, catalog)).toEqual({ type: "endTurn", player: "p1" });
  });

  it("画面に渡す時計：手番の人は、ターンの残り（持ち時間は前の版の画面のために送る）。見る人を p1 にそろえる", () => {
    const s = game();
    const c = startClock(s, T0);
    const v1 = clockFor(c, s, GO + 12_000, "p1");
    expect(v1).toMatchObject({ running: "p1", turnLeft: CLOCK.turnMs - 12_000, pickLeft: null, holdMs: 0 });
    expect(v1.bank).toEqual({ p1: CLOCK.bankMs - 12_000, p2: CLOCK.bankMs });
    const v2 = clockFor(c, s, GO + 12_000, "p2");
    expect(v2.running).toBe("p2");
    expect(v2.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs - 12_000 });
  });

  it("相手が差し出しを選ぶあいだは手番の人の時計を止め、15 秒過ぎたら自動で選ぶ", () => {
    const s = game();
    s.players.p2.field[0] = {
      uid: 90,
      cardId: DECKS.solo_idol[0] as string,
      damage: 0,
      canAttack: false,
      attacksLeft: 0,
      atkBuff: 0,
      hpBuff: 0,
      dark: false,
      darkUsed: false,
      exposed: false,
      boundUntil: 0,
      silenced: false,
      noGuard: false,
      token: false,
    };
    const waiting: GameState = {
      ...s,
      pending: { kind: "sacrifice", source: "p1", sourceUid: 1, waiting: ["p2"], picks: {} },
    };
    const c = tickClock(startClock(s, T0), s, waiting, GO + 10_000);
    expect(c.since).toBeNull();
    expect(c.spent).toBe(10_000);
    expect(clockDeadline(c, waiting)).toBe(GO + 10_000 + CLOCK.pickMs);
    expect(clockAction(c, waiting, GO + 10_000 + CLOCK.pickMs, catalog)).toEqual({
      type: "sacrifice",
      player: "p2",
      slot: 0,
    });
    // 選び終えたら、手番の人の時計がまた動く（止まっていた分は使っていない）
    const after = tickClock(c, waiting, s, GO + 20_000);
    expect(after.since).toBe(GO + 20_000);
    expect(clockDeadline(after, s)).toBe(GO + 20_000 + CLOCK.turnMs - 10_000);
  });

  it("ターンの 60 秒が切れたとき、手番の人が差し出しを選ぶ番なら、先に自動で選んでからターンを終える", () => {
    const s = game();
    s.players.p1.field[0] = {
      uid: 91,
      cardId: DECKS.solo_flame[0] as string,
      damage: 0,
      canAttack: false,
      attacksLeft: 0,
      atkBuff: 0,
      hpBuff: 0,
      dark: false,
      darkUsed: false,
      exposed: false,
      boundUntil: 0,
      silenced: false,
      noGuard: false,
      token: false,
    };
    const waiting: GameState = {
      ...s,
      pending: { kind: "sacrifice", source: "p1", sourceUid: 1, waiting: ["p1"], picks: {} },
    };
    const c = tickClock(startClock(s, T0), s, waiting, GO);
    expect(clockAction(c, waiting, GO + CLOCK.turnMs, catalog)).toEqual({
      type: "sacrifice",
      player: "p1",
      slot: 0,
    });
  });
});

describe("レーティング", () => {
  it("同じ値どうしなら 16 動く。2 人の増減は同じ幅", () => {
    expect(RATING.start).toBe(1500);
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(rateGame(1500, 1500)).toEqual({ winner: 1516, loser: 1484, delta: 16 });
  });

  it("格上に勝つと大きく上がり、格下に勝っても少ししか上がらない（それでも 1 は上がる）", () => {
    expect(rateGame(1400, 1600).delta).toBe(24);
    expect(rateGame(1600, 1400).delta).toBe(8);
    expect(rateGame(2500, 1000).delta).toBe(1);
  });
});
