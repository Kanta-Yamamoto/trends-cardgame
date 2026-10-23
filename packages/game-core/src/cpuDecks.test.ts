import { CARDS, CPU_DECKS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { validateDeck } from "./deck";
import type { RuleCard } from "./types";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;

describe("ランダムマッチで待機している CPU のデッキ", () => {
  it("構築済みデッキの 7 つで、どれもデッキの決まりを守っている", () => {
    expect(CPU_DECKS).toHaveLength(7);
    for (const id of CPU_DECKS) expect([id, validateDeck(DECKS[id], catalog)]).toEqual([id, []]);
  });
});
