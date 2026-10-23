import { render } from "@testing-library/react";
import { CARDS, type CardDef } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { HoloCard } from "./HoloCard";
import { stars, typeLabel } from "./meta";

/**
 * カードに載せてよい文字は、カードを成り立たせるものだけ（docs/card-text.md「カードに載せる文字」）。
 * 名前・コスト・攻撃力・体力・★・種類・属性・種族・効果文・闇堕ちの札と、数字の見出し（攻撃・体力）。
 * 肩書き・フレーバー・通し番号・飾りの文字（「LIVE」「依頼状」など）は、★に関係なく載せない
 */
function allowed(
  card: CardDef,
  shown: { name: string; effect: string; attack?: number; hp?: number },
): string[] {
  return [
    shown.name,
    // 名前を 1 文字ずつ切り抜いて並べるデザイン（伝説のコラ画像）
    ...(card.id === "k5" ? shown.name.split("") : []),
    // 名前を「〜の」と本体の 2 段に分けるデザイン（クサハミの闇堕ち）
    ...(shown.name.match(/^(.+の)(クサハミ)$/)?.slice(1) ?? []),
    shown.effect,
    String(card.cost),
    String(shown.attack ?? ""),
    String(shown.hp ?? ""),
    stars(card.rarity),
    typeLabel(card),
    "ニュートラル",
    ...card.attributes,
    ...card.kaiwai.map((k) => `${k}種族`),
    "闇堕ち",
    "攻撃",
    "体力",
  ].filter((s) => s !== "");
}

/** 許した文字を取り除いたあとに、言葉（かな・漢字・英数字）が残っていないか */
function leftover(text: string, ok: string[]): string {
  let rest = text;
  for (const s of [...ok].sort((a, b) => b.length - a.length)) rest = rest.split(s).join(" ");
  return (rest.match(/[ぁ-んァ-ヶー一-龠a-zA-Z0-9０-９]+/g) ?? []).join(" ");
}

describe("カードに載せる文字", () => {
  const faces = CARDS.filter((c) => !c.token).flatMap((c) => [
    { id: c.id, card: c, darkForm: false, shown: c },
    ...(c.dark ? [{ id: `${c.id}.dark`, card: c, darkForm: true, shown: { ...c.dark } }] : []),
  ]);

  it.each(faces)("$id は、カードを成り立たせる文字だけ", ({ card, darkForm, shown }) => {
    const { container } = render(<HoloCard card={card} idle={false} darkForm={darkForm} />);
    expect(leftover(container.textContent ?? "", allowed(card, shown))).toBe("");
  });
});
