import { describe, expect, it } from "vitest";
import { LEVELS_KEY, levelGain, readLevels } from "./levels";

const from =
  (values: Record<string, string>) =>
  (key: string): string | null =>
    values[key] ?? null;

describe("音楽と効果音の大きさ", () => {
  it("0 は無音で、最初の段階 3 が今までの大きさ。上がるほど大きい", () => {
    expect(levelGain(0)).toBe(0);
    expect(levelGain(3)).toBe(1);
    for (let i = 1; i <= 5; i++) expect(levelGain(i)).toBeGreaterThan(levelGain(i - 1));
  });

  it("覚えていなければ、どちらも真ん中の 3", () => {
    expect(readLevels(from({}))).toEqual({ bgm: 3, se: 3 });
  });

  it("覚えた大きさを音楽と効果音で別々に読む", () => {
    expect(readLevels(from({ [LEVELS_KEY]: '{"bgm":1,"se":5}' }))).toEqual({ bgm: 1, se: 5 });
  });

  it("前に止めるボタンで止めていた人は、無音のまま", () => {
    expect(readLevels(from({ "trends.homeMusic": "off" }))).toEqual({ bgm: 0, se: 0 });
    expect(readLevels(from({ "trends.homeMusic": "on" }))).toEqual({ bgm: 3, se: 3 });
  });

  it("壊れた値は最初の段階に戻す", () => {
    expect(readLevels(from({ [LEVELS_KEY]: "こわれた" }))).toEqual({ bgm: 3, se: 3 });
    expect(readLevels(from({ [LEVELS_KEY]: '{"bgm":9,"se":-1}' }))).toEqual({ bgm: 3, se: 3 });
  });
});
