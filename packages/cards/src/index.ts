import raw from "./cards.json";
import type { CardDef } from "./types";

export { CPU_DECKS } from "./cpuDecks";
export { DECKS, type DeckId } from "./decks";
export * from "./glossary";
export { darkEffectText, effectText, MAX_EFFECT_LENGTH, type NameOf, TRIGGER_LABELS } from "./text";
export * from "./types";

export const CARDS: readonly CardDef[] = raw as CardDef[];

export function getCard(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card: ${id}`);
  return c;
}

/** ミナモの二つ名。カードには載せない（10月24日の決まり）。場に出たときの演出の名前の札にだけ出す */
export const MINAMO_EPITHET = "癒し系VTuber";

/** 世界観の固有名（カード名・闇堕ちの姿の名前・二つ名）。用語の決まりの外（「炎上商法」「凸待ち配信者」など） */
export const PROPER_NAMES: readonly string[] = [
  ...new Set([...CARDS.flatMap((c) => [c.name, c.dark?.name ?? ""]), MINAMO_EPITHET].filter((n) => n !== "")),
];
