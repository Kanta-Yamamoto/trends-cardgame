/** 再現できる乱数（mulberry32）。状態に seed を持たせ、同じ操作なら同じ結果になる */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const nextSeed = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, nextSeed];
}
