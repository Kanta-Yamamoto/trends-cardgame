import { describe, expect, it } from "vitest";
import { extraCopies, isRentalDeck, missingCards } from "./collection";

describe("持っているカードとレンタルデッキ", () => {
  const deck = ["a", "a", "b", "c"];

  it("足りないカードを、ID ごとの足りない枚数で返す", () => {
    expect(missingCards(deck, {})).toEqual({ a: 2, b: 1, c: 1 });
    expect(missingCards(deck, { a: 1, b: 3 })).toEqual({ a: 1, c: 1 });
    expect(missingCards(deck, { a: 2, b: 1, c: 1 })).toEqual({});
  });

  it("1 枚でも足りなければレンタルデッキ", () => {
    expect(isRentalDeck(deck, { a: 2, b: 1, c: 1 })).toBe(false);
    expect(isRentalDeck(deck, { a: 1, b: 1, c: 1 })).toBe(true);
    expect(isRentalDeck(deck, {})).toBe(true);
  });

  it("デッキに入れられる 2 枚を超えた分がダブり", () => {
    expect(extraCopies(0)).toBe(0);
    expect(extraCopies(2)).toBe(0);
    expect(extraCopies(5)).toBe(3);
  });
});
