import { describe, expect, it } from "vitest";
import { grab, letGo, newTear, PACK_W, pull, shape, step, still, type Tear, type TearEvent } from "./tear";

/** 指を from から to へ、ms ミリ秒かけて動かす（60 フレーム毎秒）。高さは y0 から y1 へ。起きたことを返す */
function swipe(t: Tear, from: number, to: number, ms: number, y0 = 38, y1 = y0): TearEvent[] {
  const ev: TearEvent[] = [];
  const n = Math.round(ms / (1000 / 60));
  for (let i = 1; i <= n; i++) {
    pull(t, from + ((to - from) * i) / n, y0 + ((y1 - y0) * i) / n);
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
  it("指を止めたら裂け目も止まり、9 割まで裂けたら、残りは指を待たずに一気に裂けきる", () => {
    const t = newTear();
    grab(t, 10, 38);
    swipe(t, 10, 160, 300);
    wait(t, 300);
    expect(t.done).toBe(false); // 指を止めたら、裂け目も指の所で止まる
    expect(t.tip).toBeGreaterThan(140);
    expect(t.tip).toBeLessThan(PACK_W * 0.9);
    swipe(t, 160, 186, 80);
    letGo(t, false); // 9 割を越えたら、指をはなしても裂けきる
    const ev = wait(t, 150);
    expect(ev).toContain("done");
    expect(t.tip).toBe(PACK_W);
  });

  it("真ん中に指を置いても、そこから右端までで裂けきる", () => {
    const t = newTear();
    grab(t, 100, 38);
    swipe(t, 100, 170, 300);
    wait(t, 200);
    expect(t.done).toBe(false);
    swipe(t, 170, PACK_W, 60);
    wait(t, 200);
    expect(t.done).toBe(true);
  });

  it("切り口は少し引っぱるまで破れず、その間は上の端だけが浮いて、パックが傾く", () => {
    const t = newTear();
    grab(t, 0, 38);
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
    grab(t, 0, 38);
    swipe(t, 0, 90, 300);
    letGo(t, false);
    wait(t, 2000);
    expect(t.done).toBe(false);
    expect(t.tip).toBeGreaterThan(50);
    expect(still(t)).toBe(true);
    // 続きから裂ける
    grab(t, 95, 38);
    swipe(t, 95, PACK_W, 200);
    wait(t, 200);
    expect(t.done).toBe(true);
  });

  it("押しただけ・7 割を越えてはなしたときは、残りを自動で切る", () => {
    const tap = newTear();
    grab(tap, 50, 38);
    letGo(tap, true);
    expect(wait(tap, 700)).toContain("done");

    const t = newTear();
    grab(t, 0, 38);
    swipe(t, 0, 160, 300);
    wait(t, 200);
    letGo(t, false);
    expect(wait(t, 400)).toContain("done");
  });

  it("フレームの間が空いても（遅い端末）、ばねは暴れない", () => {
    const t = newTear();
    grab(t, 0, 38);
    pull(t, 60, 38);
    for (let i = 0; i < 20; i++) step(t, 0.05);
    letGo(t, false);
    for (let i = 0; i < 60; i++) step(t, 0.05);
    expect(Math.abs(t.rot.x)).toBeLessThan(5);
    expect(still(t)).toBe(true);
  });

  it("切り取り線は、なぞり始めた高さから指の高さへのまっすぐな線。斜めになぞれば斜めに裂ける", () => {
    const t = newTear();
    grab(t, 4, 20);
    swipe(t, 4, PACK_W, 500, 20, 44);
    wait(t, 200);
    expect(t.done).toBe(true);
    const s = shape(t);
    expect(s.yl).toBe(20);
    expect(s.yr).toBeGreaterThan(41);
    expect(s.yr).toBeLessThanOrEqual(46);
    expect(s.ang).toBeGreaterThan(5);
    // まっすぐ横になぞれば、横にまっすぐ
    const flat = newTear();
    grab(flat, 4, 30);
    swipe(flat, 4, PACK_W, 400, 30);
    expect(shape(flat).yr).toBeCloseTo(30, 5);
  });

  it("線はパックのタイトルより上に収まる（下の方を押しても、斜めに動かしても）", () => {
    const t = newTear();
    grab(t, 4, 260);
    expect(t.y0).toBe(46);
    swipe(t, 4, PACK_W, 400, 260, 0);
    expect(shape(t).yr).toBeGreaterThanOrEqual(18 - 0.01);
    const down = newTear();
    grab(down, 4, 20);
    swipe(down, 4, PACK_W, 400, 20, 200);
    expect(shape(down).yr).toBeLessThanOrEqual(46 + 0.01);
  });

  it("上の端が浮いた分だけ口が開き、裂けきると口全体が開く", () => {
    const t = newTear();
    grab(t, 0, 38);
    swipe(t, 0, 15, 100);
    wait(t, 300);
    expect(shape(t).mouth).toBeGreaterThan(1);
    expect(shape(t).hx).toBe(PACK_W);
    swipe(t, 15, 120, 200);
    expect(shape(t).hx).toBeLessThan(PACK_W);
    swipe(t, 120, PACK_W, 100);
    wait(t, 200);
    expect(shape(t).mouthEnd).toBeGreaterThan(0);
  });
});
