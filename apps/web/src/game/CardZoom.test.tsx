import { render } from "@testing-library/react";
import { CARDS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { HELP } from "../help/help";
import { CardZoom } from "./CardZoom";

/**
 * 拡大の画面に、キーワード・状態・仕組みの説明を並べない（docs/card-text.md「考え方」）。
 * 説明は、語を押した先の解説の小窓（HelpSheet）だけに置く
 */
describe("拡大の画面は説明を並べない", () => {
  const texts = Object.values(HELP).map((h) => h.text);

  it.each(CARDS.filter((c) => !c.token).map((c) => ({ id: c.id, card: c })))(
    "$id の拡大に、解説の小窓の文が無い",
    ({ card }) => {
      const { container } = render(<CardZoom card={card} darkPreview onClose={() => {}} />);
      const shown = container.textContent ?? "";
      expect(texts.filter((t) => shown.includes(t))).toEqual([]);
      // 闇堕ちの仕組みの説明も並べない（「闇堕ち」の語を押すと開く）
      expect(shown).not.toMatch(/コストなしで|自動で戻って/);
    },
  );
});
