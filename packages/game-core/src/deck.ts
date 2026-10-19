import { DECK_SIZE, MAX_ACE_KINDS, MAX_COPIES, MAX_DECK_ATTRIBUTES } from "@trends/cards";
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
 * 30枚・同じカードは3枚まで・トークンは入れられない・属性のある★5は MAX_ACE_KINDS（1種類）まで（共通の★5は数えない）・属性は MAX_DECK_ATTRIBUTES（今は1つ）まで（共通カードはいくつでも）
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
    else if (card.retired) errors.push(`お蔵入りのカードはデッキに入れられません：${id}`);
    if (n > MAX_COPIES) errors.push(`同じカードは${MAX_COPIES}枚までです：${id}（${n}枚）`);
  }
  // 属性のある★5（エース）は1種類まで。共通の★5（『フィクサー』）は、どのパーティにも加われる黒幕なので数えない
  const aces = [...counts.keys()].filter(
    (id) => catalog[id]?.rarity === 5 && (catalog[id]?.attributes.length ?? 0) > 0,
  );
  if (aces.length > MAX_ACE_KINDS)
    errors.push(
      `属性のある★5は${MAX_ACE_KINDS}種類までです（1つの軸に沿ったデッキにします。今は${aces.length}種類。共通の★5は数えません）`,
    );
  const attrs = deckAttributes(deck, catalog);
  if (attrs.length > MAX_DECK_ATTRIBUTES)
    errors.push(`属性は${MAX_DECK_ATTRIBUTES}つまでです（共通カードは数えません。今は ${attrs.join("・")}）`);
  return errors;
}

/**
 * デッキの指し方。構築済みデッキは ID（"solo_flame" など）、自分で組んだデッキは "custom:" に続けてカード ID をカンマでつなぐ
 * （例 "custom:f1,f1,f7,…"）。オンライン対戦でサーバーに送るのも、対戦の記録に残すのもこの文字列
 */
export const CUSTOM_DECK_PREFIX = "custom:";

export function encodeCustomDeck(cards: readonly string[]): string {
  return CUSTOM_DECK_PREFIX + cards.join(",");
}

export function isCustomDeckRef(ref: unknown): ref is string {
  return typeof ref === "string" && ref.startsWith(CUSTOM_DECK_PREFIX);
}

/**
 * デッキの指し方からカードの並びを得る。構築済みの ID なら decks から、custom ならほどいて返す。
 * どちらでもなければ null。中身の決まり（30枚など）はここでは確かめない（validateDeck を使う）
 */
export function resolveDeckRef(ref: unknown, decks: Record<string, readonly string[]>): string[] | null {
  if (typeof ref !== "string") return null;
  if (ref in decks) return [...(decks[ref] as readonly string[])];
  if (!isCustomDeckRef(ref)) return null;
  const body = ref.slice(CUSTOM_DECK_PREFIX.length);
  if (body.length === 0 || body.length > 2000) return null;
  const ids = body.split(",").map((s) => s.trim());
  return ids.every((s) => /^[a-z0-9-]+$/i.test(s)) ? ids : null;
}
