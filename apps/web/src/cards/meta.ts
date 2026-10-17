import type { Attribute, CardDef } from "@trends/cards";

/** 属性ごとの色とマーク（色だけで区別しないよう、必ずマークも出す） */
export const ATTR_META: Record<Attribute, { slug: string; color: string; deep: string; mark: string }> = {
  炎上: { slug: "flame", color: "#ff5a1f", deep: "#7a1d05", mark: "炎" },
  メロい: { slug: "mero", color: "#ff4fa3", deep: "#7a0f45", mark: "♥" },
  癒し: { slug: "iyashi", color: "#3ec8f0", deep: "#0b4f66", mark: "◎" },
  草: { slug: "kusa", color: "#6bcb3b", deep: "#25520c", mark: "w" },
  神: { slug: "kami", color: "#f2c14e", deep: "#6b4c06", mark: "✦" },
};

/** ★の並び（★5 → ★★★★★） */
export const stars = (n: number) => "★".repeat(n);

/** カードの背景色（2属性なら斜めに塗り分ける） */
export function attrBackground(card: Pick<CardDef, "attributes">): string {
  const [a, b] = card.attributes.map((x) => ATTR_META[x]);
  if (!a) return "#333";
  if (!b)
    return `radial-gradient(120% 75% at 50% 15%, color-mix(in srgb, ${a.color} 55%, white), ${a.color} 45%, ${a.deep})`;
  return `linear-gradient(125deg, ${a.color} 0%, ${a.deep} 49.5%, ${b.deep} 50.5%, ${b.color} 100%)`;
}

export const typeLabel = (card: CardDef) =>
  card.token ? "トークン" : card.type === "post" ? "投稿" : "アイコン";
