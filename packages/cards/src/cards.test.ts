import { describe, expect, it } from "vitest";
import { CARDS, DECKS, getCard } from "./index";

describe("cards.json", () => {
  it("ID が重複していない", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("コスト・攻撃力・体力が正の整数", () => {
    for (const c of CARDS) {
      for (const v of [c.cost, c.attack, c.hp]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it("イラストがあるカードの画像パスは assets/cards を指している", () => {
    for (const c of CARDS.filter((x) => x.art)) {
      expect(c.art).toMatch(/^\/assets\/cards\/.+\.jpg$/);
      expect(c.subject).toMatch(/^\/assets\/cards\/.+\.webp$/);
    }
  });

  it("デッキは20枚で、すべて登録済みのカード", () => {
    for (const deck of Object.values(DECKS)) {
      expect(deck).toHaveLength(20);
      for (const id of deck) expect(() => getCard(id)).not.toThrow();
    }
  });

  it("getCard は存在しない ID でエラー", () => {
    expect(() => getCard("nope")).toThrow();
  });
});
