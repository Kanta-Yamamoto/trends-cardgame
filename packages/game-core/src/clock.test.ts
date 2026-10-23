import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { CLOCK, clockAction, clockDeadline, clockFor, startClock, tickClock } from "./clock";
import { applyAction, createGame } from "./engine";
import { expectedScore, RATING, rateGame } from "./rating";
import type { GameState, RuleCard } from "./types";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const game = () => createGame({ decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol }, seed: 5, first: "p1" });
const T0 = 1_000_000;
/** 時計が動き出す時刻（始めの待ちのあと） */
const GO = T0 + CLOCK.startGraceMs;
const endTurn = (s: GameState) => applyAction(s, { type: "endTurn", player: s.active }, catalog).state;

describe("持ち時間", () => {
  it("始めは、待ちのあとターンの 30 秒と持ち時間 5 分で時間切れになる", () => {
    const s = game();
    const c = startClock(s, T0);
    expect(clockDeadline(c, s)).toBe(GO + CLOCK.turnMs + CLOCK.bankMs);
    expect(clockAction(c, s, GO + CLOCK.turnMs + CLOCK.bankMs - 1, catalog)).toBeNull();
    expect(clockAction(c, s, GO + CLOCK.turnMs + CLOCK.bankMs, catalog)).toEqual({
      type: "timeout",
      player: "p1",
    });
    // 待ちのあいだは減らない
    expect(clockFor(c, s, T0 + 1000, "p1")).toMatchObject({ turnLeft: CLOCK.turnMs, holdMs: 4000 });
  });

  it("30 秒以内にターンを終えれば、持ち時間は減らない。超えた分だけ減る", () => {
    let s = game();
    let c = startClock(s, T0);
    let next = endTurn(s);
    c = tickClock(c, s, next, GO + 20_000);
    s = next;
    expect(c.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs });
    // p2 は 50 秒かけた → 20 秒減る
    next = endTurn(s);
    c = tickClock(c, s, next, GO + 20_000 + 50_000);
    expect(c.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs - 20_000 });
    expect(clockDeadline(c, next)).toBe(GO + 70_000 + CLOCK.turnMs + CLOCK.bankMs);
  });

  it("持ち時間を使い切ったら、毎ターン 30 秒で時間切れ負けになる", () => {
    const s = game();
    const c = { ...startClock(s, T0), bank: { p1: 0, p2: CLOCK.bankMs } };
    const due = clockAction(c, s, GO + CLOCK.turnMs, catalog);
    expect(due).toEqual({ type: "timeout", player: "p1" });
    const r = applyAction(s, due as NonNullable<typeof due>, catalog);
    expect(r.state.winner).toBe("p2");
    expect(r.events.map((e) => e.type)).toEqual(["timedOut", "won"]);
    expect(clockDeadline(tickClock(c, s, r.state, GO + CLOCK.turnMs), r.state)).toBeNull();
  });

  it("画面に渡す時計：手番の人の残りは、ターンの時間を使い切ると持ち時間から減って見える。見る人を p1 にそろえる", () => {
    const s = game();
    const c = startClock(s, T0);
    const v1 = clockFor(c, s, GO + 40_000, "p1");
    expect(v1).toMatchObject({ running: "p1", turnLeft: 0, pickLeft: null, holdMs: 0 });
    expect(v1.bank).toEqual({ p1: CLOCK.bankMs - 10_000, p2: CLOCK.bankMs });
    const v2 = clockFor(c, s, GO + 40_000, "p2");
    expect(v2.running).toBe("p2");
    expect(v2.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs - 10_000 });
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
    expect(clockDeadline(after, s)).toBe(GO + 20_000 + CLOCK.turnMs + CLOCK.bankMs - 10_000);
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
