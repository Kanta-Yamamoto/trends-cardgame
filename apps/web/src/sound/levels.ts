/**
 * 音楽と効果音の大きさ（10月31日。オーナー：「BGM と SE の大きさを自分で自由に調整できるようにしよう」
 * 「細かい スクロールバーは不要だから5段階とかでいい」「0から MAX を5にしたときに真ん中にしておいて」「今の基準はこの大きさでいいと思う、両方」）。
 * 0 は無音、5 が一番大きい。3（最初の段階）が今までの大きさ
 */

export const LEVEL_MAX = 5;
export const LEVEL_DEFAULT = 3;

/** 段階ごとの倍率。一番大きくても、音量 0.7 の曲がふちを超えて割れないように 1.4 倍まで */
const GAINS = [0, 0.3, 0.6, 1, 1.2, 1.4];

export type SoundKind = "bgm" | "se";
export type SoundLevels = Record<SoundKind, number>;

/** 大きさを端末に覚える */
export const LEVELS_KEY = "trends.soundLevels";
/** 止めるボタンだった頃の設定（"off" で止めていた）。止めていた人は、無音のまま始める */
const OLD_KEY = "trends.homeMusic";

export function levelGain(level: number): number {
  return GAINS[level] ?? 1;
}

const valid = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= LEVEL_MAX;

/** 覚えている大きさを読む。無いときや読めないときは最初の段階 */
export function readLevels(get: (key: string) => string | null): SoundLevels {
  const start = { bgm: LEVEL_DEFAULT, se: LEVEL_DEFAULT };
  try {
    const saved = get(LEVELS_KEY);
    if (saved) {
      const { bgm, se } = JSON.parse(saved);
      return { bgm: valid(bgm) ? bgm : start.bgm, se: valid(se) ? se : start.se };
    }
    return get(OLD_KEY) === "off" ? { bgm: 0, se: 0 } : start;
  } catch {
    return start;
  }
}
