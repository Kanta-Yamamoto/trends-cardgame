import type { CardDef } from "@trends/cards";
import { DIRECTOR_MOTION, DuotoneFace } from "./Duotone";

/** 『演出家』（★5・共通）：真紅と黒の二色。運営サイドのカード面の基準 */
export function DirectorFace({ card }: { card: CardDef }) {
  return <DuotoneFace card={card} en="DIRECTOR" motion={DIRECTOR_MOTION} />;
}
