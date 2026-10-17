import { describe, expect, it } from "vitest";
import { measureStage } from "./Play";

describe("measureStage（対戦画面の舞台の大きさ）", () => {
  it("16:9 は 960×540 のまま", () => {
    const s = measureStage(1280, 720);
    expect([s.width, s.height, s.slot]).toEqual([960, 540, 100]);
    expect(s.scale).toBeCloseTo(4 / 3);
  });

  it("横長（20:9）は舞台を低くして、画面いっぱいに使う", () => {
    const s = measureStage(915, 412);
    expect(s.height).toBeCloseTo(432, 0);
    expect(s.width * s.scale).toBeCloseTo(915, 0);
    expect(s.height * s.scale).toBeLessThanOrEqual(412);
  });

  it("切り欠き・ホームバーの分を除いた範囲に収める", () => {
    const safe = { t: 0, r: 59, b: 21, l: 59 };
    const s = measureStage(852, 393, safe);
    expect(s.width * s.scale).toBeLessThanOrEqual(852 - 118 + 0.01);
    expect(s.height * s.scale).toBeLessThanOrEqual(393 - 21 + 0.01);
    expect(s.cx).toBe(59 + (852 - 118) / 2);
    expect(s.cy).toBe((393 - 21) / 2);
  });
});
