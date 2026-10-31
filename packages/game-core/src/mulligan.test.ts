import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { planMulligan } from "./ai";
import { CLOCK, clockAction, clockDeadline, clockFor, startClock, tickClock } from "./clock";
import { applyAction, createGame } from "./engine";
import { replayRecord } from "./record";
import type { Action, GameState, RuleCard } from "./types";
import { eventsFor, stateFor } from "./view";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const game = (first: "p1" | "p2" = "p1") =>
  createGame({ decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol }, seed: 7, first, mulligan: true });
const run = (s: GameState, a: Action) => applyAction(s, a, catalog);
const mull = (s: GameState, player: "p1" | "p2", handIndexes: number[]) =>
  run(s, { type: "mulligan", player, handIndexes });

describe("手札の引き直し", () => {
  it("引き直しのある対戦は、両者が選び終えるまで、ほかの操作ができない（降参はできる）", () => {
    const s = game();
    expect(s.mulligan).toEqual({ waiting: ["p1", "p2"] });
    expect(() => run(s, { type: "endTurn", player: "p1" })).toThrow(/引き直すカードを選んで/);
    expect(run(s, { type: "resign", player: "p2" }).state.winner).toBe("p1");
    // 引き直しの無い対戦は持たない
    expect(createGame({ decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol } }).mulligan).toBeUndefined();
  });

  it("選んだカードだけを、同じ位置に山札の上から引き直す。戻したカードは山札に入り、枚数は変わらない", () => {
    const s = game();
    const before = s.players.p1;
    const r = mull(s, "p1", [0, 2]);
    const after = r.state.players.p1;
    expect(after.hand[1]).toBe(before.hand[1]);
    expect(after.hand[0]).toBe(before.deck[0]);
    expect(after.hand[2]).toBe(before.deck[1]);
    expect(after.hand).toHaveLength(before.hand.length);
    expect(after.deck).toHaveLength(before.deck.length);
    expect([...after.hand, ...after.deck].sort()).toEqual([...before.hand, ...before.deck].sort());
    expect(r.events).toEqual([{ type: "mulliganed", player: "p1", count: 2 }]);
    expect(r.state.mulligan).toEqual({ waiting: ["p2"] });
    // 元の state は変えない
    expect(s.players.p1.hand).toEqual(before.hand);
  });

  it("全部戻すことも、1 枚も戻さないこともできる。両者が選び終えたら先攻のターンになる", () => {
    let s = game("p2");
    const hand = s.players.p1.hand.map((_, i) => i);
    s = mull(s, "p1", hand).state;
    expect(() => mull(s, "p1", [])).toThrow(/もう引き直しました/);
    const r = mull(s, "p2", []);
    expect(r.events).toEqual([{ type: "mulliganed", player: "p2", count: 0 }]);
    expect(r.state.mulligan).toBeNull();
    expect(r.state.active).toBe("p2");
    expect(() => mull(r.state, "p1", [])).toThrow(/引き直す場面ではありません/);
    expect(run(r.state, { type: "endTurn", player: "p2" }).state.active).toBe("p1");
  });

  it("手札に無い位置は選べない", () => {
    const s = game();
    expect(() => mull(s, "p1", [9])).toThrow(/手札にありません/);
    expect(() => mull(s, "p1", [-1])).toThrow(/手札にありません/);
  });

  it("CPU は、序盤に出せないコスト 5 以上を戻す。コスト 2 以下が無ければ、コスト 4 も戻す", () => {
    const cat = {
      ...catalog,
      a: { ...(catalog.c1 as RuleCard), id: "a", cost: 1 },
      d: { ...(catalog.c1 as RuleCard), id: "d", cost: 4 },
      e: { ...(catalog.c1 as RuleCard), id: "e", cost: 6 },
    };
    const s = game();
    s.players.p1.hand = ["a", "d", "e"];
    expect(planMulligan(s, "p1", cat)).toEqual([2]);
    s.players.p1.hand = ["d", "d", "e", "e"];
    expect(planMulligan(s, "p1", cat)).toEqual([0, 1, 2, 3]);
  });

  it("相手に渡す形：引き直しを待つ人も見る人の向きにし、相手が引き直したカードは見せない", () => {
    const s = mull(game(), "p1", [0]);
    expect(stateFor(s.state, "p2").mulligan).toEqual({ waiting: ["p1"] });
    expect(stateFor(s.state, "p2").players.p2.hand.every((c) => c === "?")).toBe(true);
    expect(eventsFor(s.events, "p2")).toEqual([{ type: "mulliganed", player: "p2", count: 1 }]);
  });

  it("時計：オープニングのあと 30 秒。そのあいだ持ち時間は減らず、過ぎたら選んでいない人は引き直さない", () => {
    const T0 = 1_000_000;
    const GO = T0 + CLOCK.startGraceMs;
    const s = game();
    const c = startClock(s, T0);
    expect(c.since).toBeNull();
    expect(clockFor(c, s, T0, "p1")).toMatchObject({
      mulliganLeft: CLOCK.mulliganMs,
      holdMs: 5000,
      running: null,
    });
    expect(clockFor(c, s, GO + 10_000, "p1").mulliganLeft).toBe(20_000);
    const end = GO + CLOCK.mulliganMs + CLOCK.mulliganGraceMs;
    expect(clockDeadline(c, s)).toBe(end);
    expect(clockAction(c, s, end - 1, catalog)).toBeNull();
    expect(clockAction(c, s, end, catalog)).toEqual({ type: "mulligan", player: "p1", handIndexes: [] });
    // 1 人が選んだあとも、残りの人を待つ
    const one = mull(s, "p1", [0]).state;
    const c1 = tickClock(c, s, one, GO + 3000);
    expect(clockAction(c1, one, end, catalog)).toEqual({ type: "mulligan", player: "p2", handIndexes: [] });
    // 両者が選び終えたら、先攻のターンの時計が動き出す（持ち時間はそのまま）
    const both = mull(one, "p2", []).state;
    const c2 = tickClock(c1, one, both, GO + 8000);
    expect(c2.since).toBe(GO + 8000);
    expect(c2.mulliganSince).toBeNull();
    expect(c2.bank).toEqual({ p1: CLOCK.bankMs, p2: CLOCK.bankMs });
    expect(clockDeadline(c2, both)).toBe(GO + 8000 + CLOCK.turnMs);
  });

  it("CPU 対戦の記録は、引き直しも含めて再生できる", () => {
    const s = game();
    const moves: Action[] = [
      { type: "mulligan", player: "p1", handIndexes: [1] },
      { type: "mulligan", player: "p2", handIndexes: planMulligan(s, "p2", catalog) },
      { type: "endTurn", player: "p1" },
    ];
    let cur = s;
    for (const a of moves) cur = run(cur, a).state;
    const rec = { initial: s, moves: moves.map((action, at) => ({ action, at })) };
    const replayed = replayRecord(rec as never, catalog);
    expect(replayed.failedAt).toBeNull();
    expect(replayed.final).toEqual(cur);
  });
});
