import { describe, expect, it } from "vitest";
import { CARDS, darkEffectText, effectText, getCard } from "./index";

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
});
