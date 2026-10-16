import { describe, expect, it } from "vitest";
import { CARDS, getCard } from "./index";

describe("cards.json", () => {
  it("ID が重複していない", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("コストとパワーが正の数", () => {
    for (const c of CARDS) {
      expect(c.cost).toBeGreaterThan(0);
      expect(c.power).toBeGreaterThan(0);
    }
  });

  it("画像パスが assets/cards を指している", () => {
    for (const c of CARDS) {
      expect(c.art).toMatch(/^\/assets\/cards\/.+\.jpg$/);
      expect(c.subject).toMatch(/^\/assets\/cards\/.+\.webp$/);
    }
  });

  it("getCard は存在しない ID でエラー", () => {
    expect(() => getCard("nope")).toThrow();
  });
});
