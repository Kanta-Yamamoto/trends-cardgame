import { describe, expect, it } from "vitest";
import { CARDS, darkEffectText, effectText, getCard, MAX_EFFECT_LENGTH } from "./index";

const nameOf = (id: string) => getCard(id).name;

describe("効果文は効果データから組み立てた文と同じ（docs/card-text.md）", () => {
  it("元の姿", () => {
    for (const c of CARDS)
      expect({ id: c.id, text: c.effect }).toEqual({ id: c.id, text: effectText(c, nameOf) });
  });

  it("闇堕ちの姿", () => {
    for (const c of CARDS)
      if (c.dark)
        expect({ id: c.id, text: c.dark.effect }).toEqual({
          id: c.id,
          text: darkEffectText({ ...c, dark: c.dark }, nameOf),
        });
  });

  it("1 枚の効果文は 100 字まで（スマホで読める長さ。docs/card-text.md）", () => {
    const texts = CARDS.flatMap((c) => [
      { id: c.id, text: c.effect },
      { id: `${c.id}.dark`, text: c.dark?.effect ?? "" },
    ]);
    for (const { id, text } of texts)
      expect({ id, long: text.length > MAX_EFFECT_LENGTH }).toEqual({ id, long: false });
  });
});
