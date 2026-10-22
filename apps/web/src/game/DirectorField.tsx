import { useEffect, useRef } from "react";

/**
 * 『演出家』が場に出たとき、バトル場全体の背景を真紅と黒の二色が支配する演出（見た目だけ。ルールは game-core）。
 * カード面の基準（docs/design-standard-director.md）と同じ動き：
 * 黒い地に斜線が上から降りてきて止まる（最初は速く、最後はゆっくり）→ そのまま止まる →
 * 上の一点を軸に幕のふちが回って細い光の筋になり（そこそこ速く）→ ゆっくり閉じて黒 → 消える。
 */
const SQUARE: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
type Pt = [number, number];

/** 多角形を、直線 a→b の左側（進む向きに対して）で切る */
function clipBy(pts: Pt[], [x1, y1]: Pt, [x2, y2]: Pt): Pt[] {
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const poly = (pts: Pt[]) =>
  pts.length < 3
    ? "polygon(0 0,0 0,0 0)"
    : `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;

/** 右上がりの斜線（中央の高さ y）より上 */
const slash = (y: number) => clipBy(SQUARE, [100, y - 12], [0, y + 12]);
const APEX: Pt = [50, -6];
/** 上の一点から下へ広がる光（半分の角度 h） */
function cone(h: number): Pt[] {
  if (h <= 0.0005) return [];
  const L = 400;
  const left: Pt = [APEX[0] - Math.sin(h) * L, APEX[1] + Math.cos(h) * L];
  const right: Pt = [APEX[0] + Math.sin(h) * L, APEX[1] + Math.cos(h) * L];
  return clipBy(clipBy(SQUARE, left, APEX), APEX, right);
}
const MID = 42;
const THIN = Math.atan(11 / 106);
const SCENES: { d: number; f: (u: number) => Pt[] }[] = [
  { d: 2200, f: (u) => slash(lerp(-30, MID, 1 - (1 - u) ** 5)) }, // 降りてきて止まる
  { d: 1600, f: () => slash(MID) }, // 止まっている間に、エースが舞台に上がる
  { d: 700, f: (u) => cone(lerp((88 * Math.PI) / 180, THIN, 1 - (1 - u) ** 2)) },
  { d: 1500, f: (u) => cone(lerp(THIN, 0, ease(u))) },
];
/** 演出全体の長さ（このあと 0.5 秒で消える） */
export const DIRECTOR_MS = SCENES.reduce((a, s) => a + s.d, 0);

export function DirectorField({ onDone }: { onDone: () => void }) {
  const red = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const el = red.current;
    const box = root.current;
    if (!el || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // 動きを減らす設定では、止まった二色だけを見せて消す
      el.style.clipPath = poly(slash(MID));
      const id = window.setTimeout(() => done.current(), 2000);
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      let u = now - t0;
      for (const sc of SCENES) {
        if (u < sc.d) {
          el.style.clipPath = poly(sc.f(u / sc.d));
          raf = requestAnimationFrame(step);
          return;
        }
        u -= sc.d;
      }
      el.style.clipPath = poly([]);
      box.classList.add("out");
      window.setTimeout(() => done.current(), 500);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="director-field" ref={root} aria-hidden="true">
      <div className="df-red" ref={red} />
    </div>
  );
}
