import type { CardDef } from "@trends/cards";
import { bleedMask, makeBleed } from "../inkBleed";
import { type DuoMotion, DuotoneFace } from "./Duotone";

/** 白から黒へ滲み切るまでの長さ */
const BLEED_MS = 3400;
/** 滲みの場（カードの比 63:88 に合わせた低い解像度。人物の顔のあたりが最後まで白く残る） */
const BLEED = makeBleed(63, 88, 11, [0.5, 0.38]);

/**
 * 『フィクサー』の動き（『演出家』の斜線と幕は使わない）。ふだんは白い地に全身。
 * 拡大して見ると、紙に墨が染みこむように、ふちから黒がゆっくり滲んで全面が黒になり、そのまま黒で止まる（戻らない）
 */
const FIXER_MOTION: DuoMotion = {
  rest: () => ({ mask: bleedMask(BLEED, 0) }),
  frame: (t) => ({ mask: bleedMask(BLEED, t / BLEED_MS) }),
  endMs: BLEED_MS,
};

/** 『フィクサー』（★5・共通）：テーマの黒と、元の絵の背景の白の二色 */
export function FixerFace({ card }: { card: CardDef }) {
  return <DuotoneFace card={card} motion={FIXER_MOTION} />;
}
