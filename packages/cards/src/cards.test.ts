import { describe, expect, it } from "vitest";
import { ATTRIBUTES, CARDS, DECK_SIZE, DECKS, getCard, KAIWAI, MAX_COPIES } from "./index";

describe("cards.json", () => {
  it("ID が重複していない", () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("キャラクターは攻撃力0以上・体力1以上、呪文は攻撃力と体力を持たない", () => {
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

  it("属性は0〜1個（0個は共通カード）、種族は0〜2個で、決められたものだけ", () => {
    for (const c of CARDS) {
      expect({ id: c.id, n: c.attributes.length }).toEqual({ id: c.id, n: Math.min(1, c.attributes.length) });
      expect(c.kaiwai.length).toBeLessThanOrEqual(2);
      for (const a of c.attributes) expect(ATTRIBUTES).toContain(a);
      for (const k of c.kaiwai) expect(KAIWAI).toContain(k);
      expect([1, 2, 3, 4, 5]).toContain(c.rarity);
    }
  });

  it("2つの種族に入るのは★3以上の少数だけ", () => {
    const dual = CARDS.filter((c) => c.kaiwai.length === 2);
    for (const c of dual)
      expect({ id: c.id, rarity: c.rarity }).toEqual({ id: c.id, rarity: Math.max(3, c.rarity) });
    expect(dual.length).toBeLessThanOrEqual(10);
  });

  it("どの種族も、2つ以上の属性にまたがっている（種族が属性の言い換えにならないように）", () => {
    for (const k of KAIWAI) {
      const attrs = new Set(
        CARDS.filter((c) => c.type === "icon" && c.kaiwai.includes(k)).flatMap((c) => c.attributes),
      );
      expect({ k, attrs: attrs.size >= 2 }).toEqual({ k, attrs: true });
    }
  });

  it("場の数を見て攻撃力が変わる効果は無い（強化は一度上がったら、晒し状態と TL浄化以外では下がらない。10月24日）", () => {
    const fluid = CARDS.flatMap((c) =>
      [...(c.effects ?? []), ...(c.dark?.effects ?? [])]
        .filter((e) => e.do === "attackPerAlly" && (e.on ?? "play") !== "play")
        .map(() => c.id),
    );
    expect(fluid).toEqual([]);
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

  it("デッキは20枚、同じカードは2枚まで、トークンは入れられない", () => {
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

  it("キーワードは効果文にも書く（カードを見ただけで分かるように。闇堕ちの姿も）", () => {
    for (const c of CARDS) {
      for (const k of c.keywords)
        expect({ id: c.id, k, ok: c.effect.includes(k) }).toEqual({ id: c.id, k, ok: true });
      for (const k of c.dark?.keywords ?? [])
        expect({ id: c.id, k, ok: c.dark?.effect.includes(k) }).toEqual({ id: c.id, k, ok: true });
    }
  });

  it("getCard は存在しない ID でエラー", () => {
    expect(() => getCard("nope")).toThrow();
  });
});
