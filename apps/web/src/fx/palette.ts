import type { Attribute } from "@trends/cards";

/**
 * 演出に使う属性ごとの配色。
 * カードの属性色（cards/meta.ts の ATTR_META）をそのまま光らせると原色でぎらつくので、
 * 演出用に「主色・副色・ハイライト」の 3 色を、少しずらした色相でそろえる。
 * - main：輪や粒の主役。属性色を明るく・やや柔らかく
 * - sub：主色と隣り合う色相の差し色（2 本目の輪・粒の一部）
 * - light：中心の光。ほぼ白に属性の色を少し混ぜる
 */
export interface FxPalette {
  main: number;
  sub: number;
  light: number;
}

export const FX_PALETTE: Record<Attribute, FxPalette> = {
  // 朱〜マリーゴールド
  炎: { main: 0xff6a3d, sub: 0xffb23e, light: 0xffe6c7 },
  // ピンク〜ラベンダー
  推し: { main: 0xff5ca8, sub: 0xb983ff, light: 0xffd9ee },
  // 金〜クリーム
  神: { main: 0xf0c45c, sub: 0xfff0b8, light: 0xfffbea },
  // 若葉〜ミント
  自然: { main: 0x8edb5a, sub: 0x3fcf9b, light: 0xefffd6 },
  // 空色〜アクアミント
  水: { main: 0x4fd3f5, sub: 0x8ff0df, light: 0xe6fbff },
};

/** 属性なし（ニュートラルのカード）は銀 */
export const FX_NEUTRAL: FxPalette = { main: 0xcbd5e1, sub: 0xffffff, light: 0xffffff };

export const paletteOf = (attributes: readonly Attribute[]): FxPalette => {
  const a = attributes[0];
  return a ? FX_PALETTE[a] : FX_NEUTRAL;
};
