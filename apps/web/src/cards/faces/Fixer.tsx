import type { CardDef } from "@trends/cards";
import { DuotoneFace } from "./Duotone";

/**
 * 『フィクサー』（★5・共通）：テーマの黒と、元の絵の背景の白の二色（『演出家』と同じ作り）。
 * 黒が降り切ったあと、黒い幕が細い一本の糸になって消える（裏で糸を引く）
 */
export function FixerFace({ card }: { card: CardDef }) {
  return <DuotoneFace card={card} en="FIXER" />;
}
