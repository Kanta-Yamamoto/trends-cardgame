import { describe, expect, it } from "vitest";
import { ATTRIBUTES, CARDS, DECK_SIZE, DECKS, getCard, KAIWAI, MAX_COPIES } from "./index";

describe("cards.json", () => {
  it("ID が重複していない", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("アイコンは攻撃力0以上・体力1以上、投稿は攻撃力と体力を持たない", () => {
    for (const c of CARDS) {
      expect(Number.isInteger(c.cost) && c.cost >= 0).toBe(true);
      if (c.type === "icon") {
        expect(c.attack).toBeGreaterThanOrEqual(0);
        expect(c.hp).toBeGreaterThan(0);
      } else {
        expect(c.attack).toBeUndefined();
        expect(c.hp).toBeUndefined();
      }
    }
  });

  it("属性は1〜2個、界隈は0〜2個で、決められたものだけ", () => {
    for (const c of CARDS) {
      expect(c.attributes.length).toBeGreaterThanOrEqual(1);
      expect(c.attributes.length).toBeLessThanOrEqual(2);
      expect(c.kaiwai.length).toBeLessThanOrEqual(2);
      for (const a of c.attributes) expect(ATTRIBUTES).toContain(a);
      for (const k of c.kaiwai) expect(KAIWAI).toContain(k);
      expect([1, 2, 3, 4, 5]).toContain(c.rarity);
    }
  });

  it("効果で呼び出すカードは登録済み", () => {
    for (const c of CARDS)
      for (const e of c.effects) if ("card" in e) expect(() => getCard(e.card)).not.toThrow();
  });

  it("イラストがあるカードの画像パスは assets/cards を指している", () => {
    for (const c of CARDS.filter((x) => x.art)) {
      expect(c.art).toMatch(/^\/assets\/cards\/.+\.jpg$/);
      // 切り抜き（subject）は専用デザインのカードだけが持つ
      if (c.subject) expect(c.subject).toMatch(/^\/assets\/cards\/.+\.webp$/);
    }
  });

  it("デッキは25枚、同じカードは3枚まで、トークンは入れられない", () => {
    for (const deck of Object.values(DECKS)) {
      expect(deck).toHaveLength(DECK_SIZE);
      const counts = new Map<string, number>();
      for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, n] of counts) {
        expect(n).toBeLessThanOrEqual(MAX_COPIES);
        expect(getCard(id).token).not.toBe(true);
      }
    }
  });

  it("getCard は存在しない ID でエラー", () => {
    expect(() => getCard("nope")).toThrow();
  });
});
