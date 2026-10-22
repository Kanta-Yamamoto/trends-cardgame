/**
 * 運営サイドの二色のカード面（基準：『演出家』。docs は Project の design-standard-director.md）の、
 * 境目の形と動きの筋書き。カード面（faces/Director.tsx）とバトル場の登場演出（game/DirectorField.tsx）で共通に使う。
 * 座標はすべて 0〜100（%）。見た目だけで、ゲームのルールは持たない。
 */
export type Pt = [number, number];

export const SQUARE: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

/** 多角形を、直線 a→b の左側（進む向きに対して）で切る */
export function clipBy(pts: Pt[], [x1, y1]: Pt, [x2, y2]: Pt): Pt[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const side = (x: number, y: number) => dx * (y - y1) - dy * (x - x1);
  const out: Pt[] = [];
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k] as Pt;
    const q = pts[(k + 1) % pts.length] as Pt;
    const sp = side(p[0], p[1]);
    const sq = side(q[0], q[1]);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** clip-path の値にする（形が無ければ何も見せない） */
export const toClip = (pts: Pt[]) =>
  pts.length < 3
    ? "polygon(0 0,0 0,0 0)"
    : `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;

/** 止まる高さ（中央で、顔のあたり） */
export const MID = 42;

/** 右上がりの斜線（中央の高さ y）より上。tilt は左右の高さの差の半分 */
export const slash = (y: number, tilt = 15): Pt[] => clipBy(SQUARE, [100, y - tilt], [0, y + tilt]);

/** 上の一点（apex）から下へ広がる光。h は半分の角度（ラジアン） */
export function cone(h: number, apex: Pt = [50, -8]): Pt[] {
  if (h <= 0.0005) return [];
  const L = 400;
  const left: Pt = [apex[0] - Math.sin(h) * L, apex[1] + Math.cos(h) * L];
  const right: Pt = [apex[0] + Math.sin(h) * L, apex[1] + Math.cos(h) * L];
  return clipBy(clipBy(SQUARE, left, apex), apex, right);
}

/** いちばん細い光の筋の半分の角度 */
export const THIN = Math.atan(11 / 108);

export interface Scene {
  d: number;
  f: (u: number) => Pt[];
}

/**
 * 秒数と速さの付け方（オーナーと決めたもの）：
 * 降りてきて止まる 1.5 秒（最初は速く、最後はゆっくり）→ 止まる 2 秒 → ゆっくり動き出して加速しながら降り切る 1.2 秒 →
 * 全面が主色 0.15 秒 → 上の一点を軸に幕のふちが回って細い光の筋になる 0.6 秒 → ゆっくり閉じて黒 1.15 秒
 */
export function scenes(tilt = 15, apex: Pt = [50, -8]) {
  const IN: Scene = { d: 1500, f: (u) => slash(lerp(-35, MID, 1 - (1 - u) ** 5), tilt) };
  const HOLD: Scene = { d: 2000, f: () => slash(MID, tilt) };
  const OUT: Scene = { d: 1200, f: (u) => slash(lerp(MID, 135, u ** 3), tilt) };
  const FULL: Scene = { d: 150, f: () => SQUARE };
  const CURTAIN: Scene = { d: 600, f: (u) => cone(lerp((88 * Math.PI) / 180, THIN, 1 - (1 - u) ** 2), apex) };
  const CLOSE: Scene = { d: 1150, f: (u) => cone(lerp(THIN, 0, easeInOut(u)), apex) };
  return { IN, HOLD, OUT, FULL, CURTAIN, CLOSE };
}

/** 筋書きのある時刻（ミリ秒）の形。最後まで行ったら null */
export function shapeAt(seq: Scene[], t: number): Pt[] | null {
  let u = t;
  for (const sc of seq) {
    if (u < sc.d) return sc.f(u / sc.d);
    u -= sc.d;
  }
  return null;
}
