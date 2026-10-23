import { CARDS, CPU_DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { validateDeck } from "./deck";
import type { RuleCard } from "./types";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;

describe("ランダムマッチで待機している CPU のデッキ", () => {
  it("どれもデッキの決まりを守っている", () => {
    expect(CPU_DECKS.length).toBeGreaterThan(0);
    for (const d of CPU_DECKS) expect([d.name, validateDeck([...d.cards], catalog)]).toEqual([d.name, []]);
  });
});
