import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { autoSacrifice } from "./ai";
import { applyAction, createGame } from "./engine";
import { type CpuGameRecord, cardsStamp, replayRecord } from "./record";
import { type CpuThought, planTurnSearch } from "./search";
import type { RuleCard } from "./types";

const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;

/** CPU どうしで1試合して、記録を作る（人の側も CPU に打たせる） */
function playRecorded(seed: number): { rec: CpuGameRecord; final: ReturnType<typeof createGame> } {
  const ids = Object.keys(DECKS) as (keyof typeof DECKS)[];
  const a = ids[seed % ids.length] as keyof typeof DECKS;
  const b = ids[(seed + 1) % ids.length] as keyof typeof DECKS;
  const initial = createGame({ decks: { p1: DECKS[a], p2: DECKS[b] }, seed });
  const rec: CpuGameRecord = {
    v: 1,
    cards: cardsStamp(real),
    human: "p1",
    cpu: "p2",
    humanDeck: { ref: a, name: a, cards: [...DECKS[a]] },
    cpuDeck: { ref: b, cards: [...DECKS[b]] },
    seed,
    first: initial.active,
    startedAt: 0,
    initial,
    moves: [],
    thoughts: [],
    end: { winner: null, turn: 1, at: 0 },
  };
  let s = initial;
  const step = (x: Parameters<typeof applyAction>[1]) => {
    s = applyAction(s, x, real).state;
    rec.moves.push({ action: x, at: rec.moves.length });
  };
  for (let t = 0; t < 60 && !s.winner; t++) {
    while (s.pending && !s.winner) {
      const who = s.pending.waiting[0] ?? s.active;
      step({ type: "sacrifice", player: who, slot: autoSacrifice(s, who, real) });
    }
    if (s.winner) break;
    const onThink = (th: CpuThought) => rec.thoughts.push({ ...th, move: rec.moves.length });
    for (const x of planTurnSearch(s, s.active, real, { timeLimitMs: 50, maxNodes: 400, onThink })) {
      if (s.winner) break;
      step(x);
    }
  }
  rec.end = { winner: s.winner, turn: s.turn, at: 0 };
  return { rec, final: s };
}

describe("CPU 対戦の記録", () => {
  it("最初の盤面に記録の手を順に当てると、同じ終わりの盤面になる（JSON にしても同じ）", () => {
    const { rec, final } = playRecorded(3);
    expect(rec.moves.length).toBeGreaterThan(10);
    const again = replayRecord(JSON.parse(JSON.stringify(rec)), real);
    expect(again.failedAt).toBeNull();
    expect(again.states).toHaveLength(rec.moves.length);
    expect(again.final).toEqual(final);
  }, 30_000);

  it("CPU が考えた中身（比べた候補と点数・選んだ候補）が残る", () => {
    const { rec } = playRecorded(4);
    expect(rec.thoughts.length).toBeGreaterThan(3);
    const t = rec.thoughts.find((x) => x.chosen >= 0);
    expect(t).toBeDefined();
    if (!t) return;
    expect(t.options.length).toBeGreaterThan(0);
    expect(t.options.length).toBeLessThanOrEqual(6);
    for (const o of t.options) expect(o.total).toBeTypeOf("number");
    // 選んだ候補の手は、そのあとに続く記録の手と同じ
    const chosen = t.options[t.chosen];
    const next = rec.moves.slice(t.move, t.move + (chosen?.actions.length ?? 0)).map((m) => m.action);
    expect(next).toEqual(chosen?.actions);
  }, 30_000);

  it("カードのデータの印は、数値や効果が変わったときだけ変わる（名前・絵では変わらない）", () => {
    const base = cardsStamp(real);
    expect(base).toMatch(/^[0-9a-f]{8}$/);
    const c14 = real.c14 as RuleCard & { name?: string };
    expect(cardsStamp({ ...real, c14: { ...c14, name: "別の名前" } as RuleCard })).toBe(base);
    expect(cardsStamp({ ...real, c14: { ...c14, cost: c14.cost + 1 } })).not.toBe(base);
  });
});
