import { MAX_COPIES } from "@trends/cards";

/**
 * 持っているカード（10月27日）。ガチャで出たカードを、カード ID ごとの枚数で持つ。
 * デッキに入れられるのは同じカード MAX_COPIES 枚（2 枚）までなので、それを超える分はダブり（あとで換算・売却できるようにする）
 */
export type Collection = Readonly<Record<string, number>>;

/** デッキを組むのに足りないカード（ID ごとの足りない枚数）。空なら、全部持っている */
export function missingCards(deck: readonly string[], owned: Collection): Record<string, number> {
  const need = new Map<string, number>();
  for (const id of deck) need.set(id, (need.get(id) ?? 0) + 1);
  const missing: Record<string, number> = {};
  for (const [id, n] of need) {
    const lack = n - (owned[id] ?? 0);
    if (lack > 0) missing[id] = lack;
  }
  return missing;
}

/**
 * 買い切りを買った時点で持っているカード（11月1日）。構築済みデッキのカードを、いちばん多く入っているデッキの枚数ずつ。
 * 構築済みデッキを崩して、そのまま自分のデッキを組み始められるように
 */
export function starterCollection(
  decks: Readonly<Record<string, readonly string[]>>,
): Record<string, number> {
  const owned: Record<string, number> = {};
  for (const deck of Object.values(decks)) {
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) owned[id] = Math.max(owned[id] ?? 0, n);
  }
  return owned;
}

/** ダブりの枚数（デッキに入れられる MAX_COPIES 枚を超えた分） */
export const extraCopies = (count: number) => Math.max(0, count - MAX_COPIES);
