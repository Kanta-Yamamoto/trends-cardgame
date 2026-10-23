import raw from "./cards.json";
import type { CardDef } from "./types";

export { CPU_DECKS } from "./cpuDecks";
export { DECKS, type DeckId } from "./decks";
export * from "./glossary";
export { darkEffectText, effectText, type NameOf } from "./text";
export * from "./types";

export const CARDS: readonly CardDef[] = raw as CardDef[];

export function getCard(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card: ${id}`);
  return c;
}

/** 世界観の固有名（カード名・闇堕ちの姿の名前・肩書き）。用語の決まりの外（「炎上商法」「凸待ち配信者」など） */
export const PROPER_NAMES: readonly string[] = [
  ...new Set(CARDS.flatMap((c) => [c.name, c.epithet, c.dark?.name ?? ""]).filter((n) => n !== "")),
];
