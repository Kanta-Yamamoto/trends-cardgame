import type { Attribute, CardDef, Kaiwai } from "@trends/cards";

/** 属性ごとの色とマーク（色だけで区別しないよう、必ずマークも出す） */
export const ATTR_META: Record<Attribute, { slug: string; color: string; deep: string; mark: string }> = {
  炎: { slug: "flame", color: "#ff5a1f", deep: "#7a1d05", mark: "炎" },
  推し: { slug: "mero", color: "#ff4fa3", deep: "#7a0f45", mark: "♥" },
  水: { slug: "iyashi", color: "#3ec8f0", deep: "#0b4f66", mark: "◎" },
  自然: { slug: "kusa", color: "#6bcb3b", deep: "#25520c", mark: "w" },
  神: { slug: "kami", color: "#f2c14e", deep: "#6b4c06", mark: "✦" },
};

/** 種族のマーク（対戦中の小さいカードで、ひと目で分かるように名前の頭の字） */
export const KAIWAI_META: Record<Kaiwai, { mark: string }> = {
  配信者: { mark: "配" },
  アイドル: { mark: "ア" },
  有識者: { mark: "有" },
  動物: { mark: "動" },
  ミーム: { mark: "ミ" },
};

/** ★の並び（★5 → ★★★★★） */
export const stars = (n: number) => "★".repeat(n);

/** カードの背景色（属性の色。2属性のカードは今は無いが、あれば斜めに塗り分ける） */
export function attrBackground(card: Pick<CardDef, "attributes">): string {
  const [a, b] = card.attributes.map((x) => ATTR_META[x]);
  // 共通カード（属性なし）は銀色
  if (!a) return "radial-gradient(120% 75% at 50% 15%, #f4f6fa, #aab3c2 45%, #3c4452)";
  if (!b)
    return `radial-gradient(120% 75% at 50% 15%, color-mix(in srgb, ${a.color} 55%, white), ${a.color} 45%, ${a.deep})`;
  return `linear-gradient(125deg, ${a.color} 0%, ${a.deep} 49.5%, ${b.deep} 50.5%, ${b.color} 100%)`;
}

export const typeLabel = (card: CardDef) =>
  card.token ? "トークン" : card.type === "post" ? "呪文" : "キャラクター";
