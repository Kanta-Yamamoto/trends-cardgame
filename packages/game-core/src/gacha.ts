/**
 * ガチャ（10月27日）。1 パック 5 枚。11月1日からジェムをやめ、買い切りのあとに配るパックを開ける形にした（docs/product.md）。
 * オーナーの決めた封入率：★5 が 3 パックに 1 枚・★4 が 2 パックに 1 枚・★3 が 1 パックに 1 枚。
 * それを満たすパックの中身（Claude の案）：1〜3 枚目は★1・★2、4 枚目は★3、5 枚目は★5 1/3・★4 1/2・★3 1/6。
 * 同じ枠で出られるカードは、どれも同じ確率（★1・★2 の枠は、★1 と★2 をまとめた中から選ぶ）
 */

/** 1 パックの枚数 */
export const PACK_SIZE = 5;
/** 買い切りのあと、毎日開けられるパックの数（日が変わるとこの数に戻り、ためられない） */
export const DAILY_PACKS = 3;
/** 買い切りを買った日に開けられるパックの数 */
export const WELCOME_PACKS = 10;
/** 一度に開けられるパックの数 */
export const MAX_OPEN_PACKS = 10;

/** パックを数える日（日本の日付。例 "2026-11-01"） */
export const packDay = (now: Date) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** 今日開けられるパックの数。日が変わっていれば DAILY_PACKS まで戻す（買った日の残りが多ければ、そのまま使える） */
export const packsToday = (packs: number, day: string | null, today: string) =>
  day === today ? packs : Math.max(packs, DAILY_PACKS);

/**
 * 1 枚分の枠。even は、並べた★のカードをまとめて同じ確率で選ぶ。odds は、先に★を割合で決めてから、その★のカードを同じ確率で選ぶ
 */
export type PackSlot =
  | { kind: "even"; rarities: readonly number[] }
  | { kind: "odds"; odds: readonly { rarity: number; p: number }[] };

export const PACK_SLOTS: readonly PackSlot[] = [
  { kind: "even", rarities: [1, 2] },
  { kind: "even", rarities: [1, 2] },
  { kind: "even", rarities: [1, 2] },
  { kind: "even", rarities: [3] },
  {
    kind: "odds",
    odds: [
      { rarity: 5, p: 1 / 3 },
      { rarity: 4, p: 1 / 2 },
      { rarity: 3, p: 1 / 6 },
    ],
  },
];

/** パックに入りうるカード（カードデータのうち、使う分だけ） */
export interface GachaCard {
  id: string;
  rarity: number;
  token?: boolean;
}

/** ★ごとの、パックに入るカードの ID（トークンは入らない）。並びは ID 順（同じ乱数なら同じ結果になるように） */
export type PackPool = Record<number, string[]>;

export function packPool(catalog: readonly GachaCard[]): PackPool {
  const pool: PackPool = {};
  for (const c of catalog) {
    if (c.token) continue;
    const ids = pool[c.rarity] ?? [];
    ids.push(c.id);
    pool[c.rarity] = ids;
  }
  for (const ids of Object.values(pool)) ids.sort();
  return pool;
}

/** 枠で出る★と、その★が出る確率・種類の数（カードの無い★は除き、残りで割合を付け直す） */
export function slotOdds(slot: PackSlot, pool: PackPool): { rarity: number; p: number; kinds: number }[] {
  if (slot.kind === "even") {
    const total = slot.rarities.reduce((n, r) => n + (pool[r]?.length ?? 0), 0);
    return slot.rarities
      .map((rarity) => ({ rarity, kinds: pool[rarity]?.length ?? 0 }))
      .filter((o) => o.kinds > 0)
      .map((o) => ({ ...o, p: o.kinds / total }));
  }
  const live = slot.odds.filter((o) => (pool[o.rarity]?.length ?? 0) > 0);
  const sum = live.reduce((n, o) => n + o.p, 0);
  return live.map((o) => ({ rarity: o.rarity, p: o.p / sum, kinds: pool[o.rarity]?.length ?? 0 }));
}

/** 1 パックで、その★が 1 枚以上出る確率 */
export function packChance(rarity: number, pool: PackPool): number {
  const miss = PACK_SLOTS.reduce((m, slot) => {
    const hit = slotOdds(slot, pool).find((o) => o.rarity === rarity)?.p ?? 0;
    return m * (1 - hit);
  }, 1);
  return 1 - miss;
}

/** 1 パック開ける（5 枚の ID。並びは枠の順で、5 枚目がいちばん★が高い枠）。rand は 0 以上 1 未満を返す */
export function openPack(pool: PackPool, rand: () => number): string[] {
  return PACK_SLOTS.map((slot) => {
    const odds = slotOdds(slot, pool);
    let r = rand();
    let rarity = odds[odds.length - 1]?.rarity;
    for (const o of odds) {
      if (r < o.p) {
        rarity = o.rarity;
        break;
      }
      r -= o.p;
    }
    const ids = rarity === undefined ? undefined : pool[rarity];
    if (!ids?.length) throw new Error("パックに入れるカードがありません");
    return ids[Math.min(ids.length - 1, Math.floor(rand() * ids.length))] as string;
  });
}
