import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { planTurn } from "./ai";
import { applyAction, createGame } from "./engine";
import { planTurnSearch } from "./search";
import type { GameState, RuleCard } from "./types";

const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const ids = Object.keys(DECKS) as (keyof typeof DECKS)[];

// テストは軽めの設定で、時間制限なし（遅いマシンでも結果が変わらないように）
const LIGHT = { beam: 8, maxNodes: 2500, finalists: 12, timeLimitMs: Number.POSITIVE_INFINITY };
const runTurn = (s: GameState, smart: boolean) => {
  for (const a of smart ? planTurnSearch(s, s.active, real, LIGHT) : planTurn(s, s.active, real)) {
    s = applyAction(s, a, real).state;
    if (s.winner) break;
  }
  return s;
};

describe("先読みする CPU（planTurnSearch）", () => {
  it("合法な操作だけで、ターン終了で終わる", () => {
    const s = createGame({
      decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol },
      seed: 5,
    });
    const plan = planTurnSearch(s, "p1", real);
    let cur = s;
    for (const a of plan) cur = applyAction(cur, a, real).state;
    expect(plan.at(-1)).toEqual({ type: "endTurn", player: "p1" });
  });

  it("どのデッキどうしでも最後まで対戦でき、決着がつく", () => {
    for (const a of ids)
      for (const b of ids) {
        let s = createGame({
          decks: { p1: DECKS[a], p2: DECKS[b] },
          seed: 11,
        });
        for (let t = 0; t < 120 && !s.winner; t++) s = runTurn(s, true);
        expect(s.winner).not.toBeNull();
      }
    // 5 デッキ × 5 = 25 試合
  }, 180_000);

  it("とどめを刺せるときは刺す", () => {
    let s = createGame({
      decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol },
      seed: 2,
    });
    // お互い数ターン進めてから、相手のライフを1にする
    for (let t = 0; t < 6 && !s.winner; t++) s = runTurn(s, false);
    const me = s.active;
    const foe = me === "p1" ? "p2" : "p1";
    s.players[foe].lp = 1;
    s.players[foe].field = s.players[foe].field.map(() => null);
    s.players[me].field = s.players[me].field.map((u) => (u ? { ...u, canAttack: true, attacksLeft: 1 } : u));
    if (!s.players[me].field.some((u) => u)) return; // 場にアイコンがいない引きなら確かめられない
    s = runTurn(s, true);
    expect(s.winner).toBe(me);
  });

  it("これまでの CPU（貪欲法）に勝ち越す", () => {
    let wins = 0;
    let games = 0;
    for (const a of ids)
      for (const b of ids)
        for (const smart of ["p1", "p2"] as const) {
          let s = createGame({
            decks: { p1: DECKS[a], p2: DECKS[b] },
            seed: 21 + (smart === "p1" ? 0 : 1),
          });
          for (let t = 0; t < 120 && !s.winner; t++) s = runTurn(s, s.active === smart);
          games++;
          if (s.winner === smart) wins++;
        }
    // 闇堕ちはコストなしで出せる強い手で、貪欲法もすぐ使うため、差は以前より小さい（2026-10 時点で 57%前後）
    expect(wins / games).toBeGreaterThan(0.55);
  }, 300_000);
});
