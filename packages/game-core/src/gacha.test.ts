import { CARDS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { openPack, PACK_SIZE, PACK_SLOTS, packChance, packPool, slotOdds } from "./gacha";
import { nextRandom } from "./rng";

const pool = packPool(CARDS);
const rarityOf = Object.fromEntries(CARDS.map((c) => [c.id, c.rarity]));

/** 同じ結果になる乱数 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    const [v, next] = nextRandom(s);
    s = next;
    return v;
  };
}

describe("ガチャ（1 パック 5 枚）", () => {
  it("パックにトークンは入らない", () => {
    const ids = Object.values(pool).flat();
    expect(ids.length).toBe(CARDS.filter((c) => !c.token).length);
    expect(ids.some((id) => CARDS.find((c) => c.id === id)?.token)).toBe(false);
  });

  it("1〜3 枚目は★1・★2、4 枚目は★3、5 枚目は★3 以上", () => {
    const rand = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const pack = openPack(pool, rand);
      expect(pack).toHaveLength(PACK_SIZE);
      const r = pack.map((id) => rarityOf[id]);
      for (const x of r.slice(0, 3)) expect([1, 2]).toContain(x);
      expect(r[3]).toBe(3);
      expect(r[4]).toBeGreaterThanOrEqual(3);
    }
  });

  it("★5 は 3 パックに 1 枚、★4 は 2 パックに 1 枚、★3 は毎パック 1 枚以上（オーナーの封入率）", () => {
    expect(packChance(5, pool)).toBeCloseTo(1 / 3, 10);
    expect(packChance(4, pool)).toBeCloseTo(1 / 2, 10);
    expect(packChance(3, pool)).toBe(1);
  });

  it("実際に開けても、その割合で出る", () => {
    const rand = seeded(2026);
    const n = 30_000;
    const got = { 3: 0, 4: 0, 5: 0 };
    let low1 = 0;
    for (let i = 0; i < n; i++) {
      const pack = openPack(pool, rand);
      const last = rarityOf[pack[4] as string] as 3 | 4 | 5;
      got[last]++;
      low1 += pack.slice(0, 3).filter((id) => rarityOf[id] === 1).length;
    }
    expect(Math.abs(got[5] / n - 1 / 3)).toBeLessThan(0.015);
    expect(Math.abs(got[4] / n - 1 / 2)).toBeLessThan(0.015);
    expect(Math.abs(got[3] / n - 1 / 6)).toBeLessThan(0.015);
    // ★1・★2 の枠は、★1 と★2 をまとめた中から同じ確率で選ぶ
    const share1 = (pool[1]?.length ?? 0) / ((pool[1]?.length ?? 0) + (pool[2]?.length ?? 0));
    expect(Math.abs(low1 / (n * 3) - share1)).toBeLessThan(0.015);
  });

  it("同じ★のカードは、どれも同じ確率で出る", () => {
    const rand = seeded(99);
    const count: Record<string, number> = {};
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const id = openPack(pool, rand)[3] as string;
      count[id] = (count[id] ?? 0) + 1;
    }
    const kinds = pool[3]?.length ?? 0;
    for (const id of pool[3] ?? []) expect(Math.abs((count[id] ?? 0) / n - 1 / kinds)).toBeLessThan(0.01);
  });

  it("枠ごとの割合は、足して 1", () => {
    for (const slot of PACK_SLOTS) {
      const sum = slotOdds(slot, pool).reduce((n, o) => n + o.p, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("カードの無い★は除き、残りで割合を付け直す", () => {
    const small = packPool([
      { id: "a", rarity: 1 },
      { id: "b", rarity: 3 },
      { id: "c", rarity: 4 },
    ]);
    const last = PACK_SLOTS[4];
    if (!last) throw new Error("5 枚目の枠がありません");
    const odds = slotOdds(last, small);
    expect(odds.map((o) => o.rarity)).toEqual([4, 3]);
    expect(odds[0]?.p).toBeCloseTo(0.75, 10);
    const pack = openPack(small, seeded(1));
    expect(pack.slice(0, 3)).toEqual(["a", "a", "a"]);
  });
});
