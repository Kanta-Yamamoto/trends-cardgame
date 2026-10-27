import { describe, expect, it } from "vitest";
import { grab, letGo, newTear, PACK_W, pull, step, still, type Tear, type TearEvent } from "./tear";

/** 指を from から to へ、ms ミリ秒かけて動かす（60 フレーム毎秒）。起きたことを返す */
function swipe(t: Tear, from: number, to: number, ms: number): TearEvent[] {
  const ev: TearEvent[] = [];
  const n = Math.round(ms / (1000 / 60));
  for (let i = 1; i <= n; i++) {
    pull(t, from + ((to - from) * i) / n);
    ev.push(...step(t, 1 / 60));
  }
  return ev;
}
function wait(t: Tear, ms: number): TearEvent[] {
  const ev: TearEvent[] = [];
  for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) ev.push(...step(t, 1 / 60));
  return ev;
}

describe("パックを裂く手ごたえ（tear.ts）", () => {
  it("左から指を動かすと、指がパックの右端に来たところで裂けきる（手前では裂けきらない）", () => {
    const t = newTear();
    grab(t, 10);
    swipe(t, 10, 180, 300);
    expect(t.done).toBe(false);
    wait(t, 200);
    expect(t.done).toBe(false); // 指を止めたら、裂け目も指の所で止まる
    expect(t.tip).toBeGreaterThan(160);
    expect(swipe(t, 180, PACK_W, 60).concat(wait(t, 200))).toContain("done");
    expect(t.tip).toBe(PACK_W);
  });

  it("真ん中に指を置いても、そこから右端までで裂けきる", () => {
    const t = newTear();
    grab(t, 100);
    swipe(t, 100, 190, 300);
    wait(t, 200);
    expect(t.done).toBe(false);
    swipe(t, 190, PACK_W, 40);
    wait(t, 200);
    expect(t.done).toBe(true);
  });

  it("切り口は少し引っぱるまで破れず、その間は上の端だけが浮いて、パックが傾く", () => {
    const t = newTear();
    grab(t, 0);
    swipe(t, 0, 15, 100);
    wait(t, 300);
    expect(t.notched).toBe(false);
    expect(t.tip).toBe(0);
    expect(t.capR.x).toBeGreaterThan(1);
    expect(t.rot.x).toBeGreaterThan(1);
    const ev = swipe(t, 15, 40, 80).concat(wait(t, 100));
    expect(ev).toContain("notch");
    expect(t.tip).toBeGreaterThan(20);
  });

  it("途中で指をはなすと、裂けた所まではそのまま残り、ばねが止まる", () => {
    const t = newTear();
    grab(t, 0);
    swipe(t, 0, 90, 300);
    letGo(t, false);
    wait(t, 2000);
    expect(t.done).toBe(false);
    expect(t.tip).toBeGreaterThan(50);
    expect(still(t)).toBe(true);
    // 続きから裂ける
    grab(t, 95);
    swipe(t, 95, PACK_W, 200);
    wait(t, 200);
    expect(t.done).toBe(true);
  });

  it("押しただけ・7 割を越えてはなしたときは、残りを自動で切る", () => {
    const tap = newTear();
    grab(tap, 50);
    letGo(tap, true);
    expect(wait(tap, 700)).toContain("done");

    const t = newTear();
    grab(t, 0);
    swipe(t, 0, 160, 300);
    wait(t, 200);
    letGo(t, false);
    expect(wait(t, 400)).toContain("done");
  });

  it("フレームの間が空いても（遅い端末）、ばねは暴れない", () => {
    const t = newTear();
    grab(t, 0);
    pull(t, 60);
    for (let i = 0; i < 20; i++) step(t, 0.05);
    letGo(t, false);
    for (let i = 0; i < 60; i++) step(t, 0.05);
    expect(Math.abs(t.rot.x)).toBeLessThan(5);
    expect(still(t)).toBe(true);
  });
});
