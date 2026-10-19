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

  it("縦持ち（Pixel 8・iPhone 15）は幅 390 の縦の舞台にして、画面に収める", () => {
    const pixel = measureStage(412, 915);
    expect(pixel.portrait).toBe(true);
    expect(pixel.width).toBe(390);
    expect(pixel.height).toBe(860); // 細長い画面は最大の高さ
    expect(pixel.width * pixel.scale).toBeLessThanOrEqual(412 + 0.01);
    expect(pixel.height * pixel.scale).toBeLessThanOrEqual(915 + 0.01);
    expect(pixel.slot).toBe(71); // 5 枠が横いっぱい
    expect(pixel.hand).toBe(124);

    const iphone = measureStage(393, 852, { t: 59, r: 0, b: 34, l: 0 });
    expect(iphone.portrait).toBe(true);
    expect(iphone.height).toBeCloseTo(390 / (393 / 759), 0);
    expect(iphone.height * iphone.scale).toBeLessThanOrEqual(759 + 0.01);
    expect(iphone.cy).toBe(59 + 759 / 2);
  });

  it("縦長の PC の窓も、縦の舞台を中央に置く（高さは 740 まで低くする）", () => {
    const s = measureStage(768, 1024);
    expect(s.portrait).toBe(true);
    expect(s.height).toBe(740);
    expect(s.hand).toBe(84);
    expect(s.scale).toBeCloseTo(1024 / 740);
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
