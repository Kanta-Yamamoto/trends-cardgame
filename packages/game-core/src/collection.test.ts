import { describe, expect, it } from "vitest";
import { extraCopies, missingCards, starterCollection } from "./collection";

describe("持っているカード", () => {
  const deck = ["a", "a", "b", "c"];

  it("足りないカードを、ID ごとの足りない枚数で返す", () => {
    expect(missingCards(deck, {})).toEqual({ a: 2, b: 1, c: 1 });
    expect(missingCards(deck, { a: 1, b: 3 })).toEqual({ a: 1, c: 1 });
    expect(missingCards(deck, { a: 2, b: 1, c: 1 })).toEqual({});
  });

  it("買ったときに持つカードは、いちばん多く入っているデッキの枚数ずつ", () => {
    expect(starterCollection({ x: ["a", "a", "b"], y: ["a", "b", "b", "c"] })).toEqual({ a: 2, b: 2, c: 1 });
  });

  it("デッキに入れられる 2 枚を超えた分がダブり", () => {
    expect(extraCopies(0)).toBe(0);
    expect(extraCopies(2)).toBe(0);
    expect(extraCopies(5)).toBe(3);
  });
});
