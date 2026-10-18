import { DECK_SIZE, MAX_COPIES, MAX_DECK_ATTRIBUTES } from "@trends/cards";
import type { RuleCard } from "./types";

type Catalog = Record<string, RuleCard>;

/** デッキに入っている属性（共通カードは数えない） */
export function deckAttributes(deck: readonly string[], catalog: Catalog): string[] {
  const set = new Set<string>();
  for (const id of deck) for (const a of catalog[id]?.attributes ?? []) set.add(a);
  return [...set];
}

/**
 * デッキの決まりを確かめ、守れていないところを日本語で返す（空なら OK）。
 * 25枚・同じカードは3枚まで・トークンは入れられない・属性は2つまで（共通カードはいくつでも）
 */
export function validateDeck(deck: readonly string[], catalog: Catalog): string[] {
  const errors: string[] = [];
  if (deck.length !== DECK_SIZE) errors.push(`デッキは${DECK_SIZE}枚にしてください（今は${deck.length}枚）`);
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const card = catalog[id];
    if (!card) errors.push(`存在しないカードです：${id}`);
    else if (card.token) errors.push(`トークンはデッキに入れられません：${id}`);
    if (n > MAX_COPIES) errors.push(`同じカードは${MAX_COPIES}枚までです：${id}（${n}枚）`);
  }
  const attrs = deckAttributes(deck, catalog);
  if (attrs.length > MAX_DECK_ATTRIBUTES)
    errors.push(`属性は${MAX_DECK_ATTRIBUTES}つまでです（今は ${attrs.join("・")}）`);
  return errors;
}
