import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { autoSacrifice, planTurn } from "./ai";
import { applyAction, createGame } from "./engine";
import { type CpuThought, planTurnSearch } from "./search";
import type { GameState, RuleCard } from "./types";

const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const ids = Object.keys(DECKS) as (keyof typeof DECKS)[];

// テストは軽めの設定で、時間制限なし（遅いマシンでも結果が変わらないように）
const LIGHT = { beam: 8, maxNodes: 2500, finalists: 12, timeLimitMs: Number.POSITIVE_INFINITY };
/** 『フィクサー』の差し出し待ちなら、待っている人が CPU の決め方で選ぶ（相手の手番の途中でも） */
const settle = (s: GameState) => {
  while (s.pending && !s.winner) {
    const who = s.pending.waiting[0] ?? s.active;
    s = applyAction(s, { type: "sacrifice", player: who, slot: autoSacrifice(s, who, real) }, real).state;
  }
  return s;
};
const runTurn = (s: GameState, smart: boolean) => {
  s = settle(s);
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

  it("比べる候補に、置いた場所だけが違う同じ中身の手を並べない", () => {
    const s = createGame({ decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol }, seed: 5, first: "p1" });
    const me = s.players.p1;
    me.hand = ["f1", "f6", "f13"];
    me.mana = 5;
    let thought: CpuThought | undefined;
    planTurnSearch(s, "p1", real, { ...LIGHT, onThink: (t) => (thought = t) });
    expect(thought?.options.length).toBeGreaterThan(1);
    // 終わりの盤面の中身（場のキャラクターは並べ替えて、場所を見ない）で見分ける
    const content = (thought?.options ?? []).map((o) => {
      let cur = s;
      for (const a of o.actions) cur = applyAction(cur, a, real).state;
      const units = (p: "p1" | "p2") =>
        cur.players[p].field
          .flatMap((u) => (u ? [`${u.cardId}.${u.damage}.${u.attacksLeft}.${u.atkBuff}.${u.hpBuff}`] : []))
          .sort()
          .join(",");
      return `${cur.players.p2.lp}|${cur.players.p1.hand.join(",")}|${units("p1")}|${units("p2")}`;
    });
    expect(new Set(content).size).toBe(content.length);
  });

  it("とどめを刺せるときは刺す", () => {
    let s = createGame({
      decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol },
      seed: 2,
    });
    // お互い数ターン進めてから、相手のライフを1にする
    for (let t = 0; t < 6 && !s.winner; t++) s = runTurn(s, false);
    // 『フィクサー』の差し出し待ちの途中なら、先に片づける
    s = settle(s);
    if (s.winner) return;
    const me = s.active;
    const foe = me === "p1" ? "p2" : "p1";
    s.players[foe].lp = 1;
    s.players[foe].field = s.players[foe].field.map(() => null);
    s.players[me].field = s.players[me].field.map((u) => (u ? { ...u, canAttack: true, attacksLeft: 1 } : u));
    if (!s.players[me].field.some((u) => u)) return; // 場にキャラクターがいない引きなら確かめられない
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
