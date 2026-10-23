import raw from "./cards.json";
import type { CardDef } from "./types";

export { CPU_DECKS, type CpuDeck } from "./cpuDecks";
export { DECKS, type DeckId } from "./decks";
export * from "./types";

export const CARDS: readonly CardDef[] = raw as CardDef[];

export function getCard(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card: ${id}`);
  return c;
}
