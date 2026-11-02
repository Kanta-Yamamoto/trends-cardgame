import { CARDS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import {
  DAILY_PACKS,
  openPack,
  openPacks,
  PACK_CAP,
  PACK_SIZE,
  PACK_SLOTS,
  packChance,
  packDay,
  packPool,
  packsToday,
  perPack,
  slotOdds,
} from "./gacha";
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

  it("1〜3 枚目は★1、4 枚目は★1・★2、5 枚目は★2 以上", () => {
    const rand = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const pack = openPack(pool, rand);
      expect(pack).toHaveLength(PACK_SIZE);
      const r = pack.map((id) => rarityOf[id]);
      for (const x of r.slice(0, 3)) expect(x).toBe(1);
      expect([1, 2]).toContain(r[3]);
      expect(r[4]).toBeGreaterThanOrEqual(2);
    }
  });

  it("★5 は 5 パックに 1 枚、★4 は 4 パックに 1 枚、★3 は 3 パックに 1 枚、★2 は 2 パックに 1 枚、★1 は毎パック 1 枚以上（オーナーの封入率）", () => {
    expect(perPack(5, pool)).toBeCloseTo(1 / 5, 10);
    expect(perPack(4, pool)).toBeCloseTo(1 / 4, 10);
    expect(perPack(3, pool)).toBeCloseTo(1 / 3, 10);
    expect(perPack(2, pool)).toBeCloseTo(1 / 2, 10);
    expect(packChance(1, pool)).toBe(1);
    expect(packChance(5, pool)).toBeCloseTo(1 / 5, 10);
  });

  it("実際に開けても、その割合で出る", () => {
    const rand = seeded(2026);
    const n = 30_000;
    const got: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < n; i++) for (const id of openPack(pool, rand)) got[rarityOf[id] as number]++;
    const per = (r: number) => (got[r] ?? 0) / n;
    expect(Math.abs(per(5) - 1 / 5)).toBeLessThan(0.015);
    expect(Math.abs(per(4) - 1 / 4)).toBeLessThan(0.015);
    expect(Math.abs(per(3) - 1 / 3)).toBeLessThan(0.015);
    expect(Math.abs(per(2) - 1 / 2)).toBeLessThan(0.02);
    expect(Math.abs(per(1) - (3 + 43 / 60))).toBeLessThan(0.03);
  });

  it("同じ★のカードは、どれも同じ確率で出る", () => {
    const rand = seeded(99);
    const count: Record<string, number> = {};
    let total = 0;
    for (let i = 0; i < 60_000; i++) {
      const id = openPack(pool, rand)[4] as string;
      if (rarityOf[id] !== 3) continue;
      count[id] = (count[id] ?? 0) + 1;
      total++;
    }
    const kinds = pool[3]?.length ?? 0;
    for (const id of pool[3] ?? [])
      expect(Math.abs((count[id] ?? 0) / total - 1 / kinds)).toBeLessThan(0.012);
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
    // ★4 1/4 と★3 1/3 だけが残り、足して 1 に付け直す
    expect(odds[0]?.p).toBeCloseTo(3 / 7, 10);
    const pack = openPack(small, seeded(1));
    expect(pack.slice(0, 3)).toEqual(["a", "a", "a"]);
  });
});

describe("2 枚持っているカードは出ない", () => {
  const rand = seeded(7);
  it("PACK_CAP 枚持っているカードは出ず、★の枠はそのまま", () => {
    // ★5 を 1 種類だけ残して、ほかの全部を 2 枚持っている
    const ids = Object.values(pool).flat();
    const keep = pool[5]?.[0] as string;
    const owned = Object.fromEntries(ids.filter((id) => id !== keep).map((id) => [id, PACK_CAP]));
    for (let i = 0; i < 300; i++) {
      const [pack] = openPacks(pool, rand, 1, owned);
      const last = pack?.[4] as string;
      if (rarityOf[last] === 5) expect(last).toBe(keep);
    }
  });

  it("前のパックで出た分も数える。その★を全部 2 枚持てば、その★のどれでも出る", () => {
    const small = packPool([
      { id: "a", rarity: 1 },
      { id: "b", rarity: 3 },
      { id: "c", rarity: 4 },
      { id: "d", rarity: 4 },
    ]);
    const have = new Map<string, number>();
    const r = seeded(3);
    for (let i = 0; i < 12; i++) {
      openPack(small, r, have);
      const c = have.get("c") ?? 0;
      const d = have.get("d") ?? 0;
      // 片方が 2 枚を超えるのは、もう片方も 2 枚になってから
      if (Math.max(c, d) > PACK_CAP) expect(Math.min(c, d)).toBeGreaterThanOrEqual(PACK_CAP);
    }
    // ★1 は 1 種類だけなので、2 枚を超えても出る（★2 が無いので、4 枚目も★1）
    expect(have.get("a")).toBe(48);
  });

  it("持っている枚数が空なら、渡さないときと同じ結果", () => {
    expect(openPacks(pool, seeded(5), 1, {})).toEqual([openPack(pool, seeded(5))]);
  });
});

describe("毎日のパック", () => {
  it("パックの日は日本の日付で数える", () => {
    expect(packDay(new Date("2026-11-01T14:59:59Z"))).toBe("2026-11-01");
    expect(packDay(new Date("2026-11-01T15:00:00Z"))).toBe("2026-11-02");
  });

  it("同じ日は残りのまま。日が変わると 5 パックに戻り、ためられない", () => {
    expect(packsToday(1, "2026-11-01", "2026-11-01")).toBe(1);
    expect(packsToday(0, "2026-11-01", "2026-11-02")).toBe(DAILY_PACKS);
    expect(packsToday(2, null, "2026-11-02")).toBe(DAILY_PACKS);
    expect(packsToday(9, "2026-11-01", "2026-11-02")).toBe(9);
  });
});
