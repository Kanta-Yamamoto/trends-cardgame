/**
 * 『演出家』の効果でエースが舞台に上がるときの「血の滴とクラウン」（見た目だけ。ルールは game-core）。
 * 枠の真上から真紅の一滴が重力で落ち → 枠の下のふちで跳ね、跳ねた輪から王冠の帯（低い円柱）が立ち上がり、
 * その上に 6 つの三角の山が上がるほど遅くなって、カードの高さの半分で止まる（伸び続けない）→
 * しばらく止まって、溜まりと一緒に全体が消える。
 * 山は真正面から 60° おきの等間隔で、ねじらない（正面から見て 3 つの山が並ぶ）。どれも同じ高さで、根もとはとなりの山とほぼつながるほど広く、
 * ふちは内へ反って先は細く尖り、先に雫の粒が乗る。上へ行くほどわずかに外へ開く。
 * 帯と山は円柱の面に貼り付いた形で描き、奥の面はカードの後ろ、手前の面はカードの前に描くので、エースを立体的に囲んで見える。
 *
 * ここは形を「塗る」だけ（u＝カードの後ろ、o＝カードの前の 2 枚のキャンバスに、黒で塗る）。
 * 何色で見せるかは DirectorField が決める（背景の地と逆の色＝真紅の上では黒、黒の上では真紅）。
 * 座標はキャンバスのピクセル。a はそのエースの演出が始まってからのミリ秒。
 * 基準のモック：claude.ai の Artifact「『演出家』エース召喚の演出案」
 */

/** 一滴が落ちる時間（止まった状態から重力で加速。重さを出すためゆっくり） */
const FALL = 560;
/** 王冠が立ち上がるまで（投げ上げと同じく、上がるほど遅くなる）・止まっている長さ・消える長さ */
const TP = 500;
const HOLD = 1000;
const FADE = 600;
/** エースがせり上がり始める時刻と長さ */
export const RISE_AT = FALL + 80;
const RISE = 620;
/** 演出全体の長さ（全体が消えるまで） */
export const CROWN_MS = FALL + TP + HOLD + FADE;
/** 山の数 */
const PILLARS = 6;
/** 山の根もとの、半分の角度（60° おきの山どうしが、すき間わずかでほぼつながる） */
const BASE_HALF = (Math.PI / PILLARS) * 0.92;
/** カードの幅を 1 としたときの大きさ：跳ねた輪の半径・帯の高さ。王冠の高さ（帯と山を合わせて）はカードの高さを 1 として */
const RING = 0.64;
const WALL = 0.12;
const HEIGHT = 0.5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, s: number, d: number) => clamp((t - s) / d);

/** エースの見え方：まだ隠す／せり上がり中（sunk＝下に沈んでいる割合）／もう普通 */
export function crownCard(a: number): { hidden: boolean; sunk: number } {
  if (a < RISE_AT) return { hidden: true, sunk: 1 };
  const u = seg(a, RISE_AT, RISE);
  return { hidden: false, sunk: (1 - u) ** 4 };
}

function drop(c: CanvasRenderingContext2D, x: number, y: number, rad: number, len: number) {
  c.beginPath();
  c.arc(x, y - rad, rad, 0, Math.PI);
  c.quadraticCurveTo(x - rad, y - rad - len * 0.4, x, y - rad - len);
  c.quadraticCurveTo(x + rad, y - rad - len * 0.4, x + rad, y - rad);
  c.fill();
}

/** 山の、根もとからの割合 v（0〜1）での円柱の半径（カードの幅を 1 として、根もとの半径 r0 から）。上へ行くほどわずかに外へ開く */
const radiusAt = (r0: number, v: number) => r0 + 0.08 * v * v;

/** 楕円を、奥の半分はカードの後ろ（u）、手前の半分は前（o）に分けて描く */
function ellipse2(
  u: CanvasRenderingContext2D,
  o: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: boolean,
) {
  for (const [c, s0, s1] of [
    [u, Math.PI, Math.PI * 2],
    [o, 0, Math.PI],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, s0, s1);
    if (fill) {
      c.closePath();
      c.fill();
    } else c.stroke();
  }
}

export function paintCrown(u: CanvasRenderingContext2D, o: CanvasRenderingContext2D, a: number, r: Box) {
  if (a < 0) return;
  const cx = r.x + r.w / 2;
  const base = r.y + r.h; // 跳ねるのは枠の下のふち
  // 落ちる一滴：止まった状態から重力で落ちる（落ちた距離は時間の 2 乗）。速くなるほど縦に伸びる
  if (a < FALL) {
    const D = r.h * 2.2;
    const k = a / FALL;
    const rad = r.w * 0.1;
    drop(o, cx, base - D + D * k * k, rad, rad * (1 + 3.2 * k));
    return;
  }
  const t = a - FALL;
  const fade = 1 - seg(t, TP + HOLD, FADE);
  if (fade <= 0) return;
  for (const c of [u, o]) {
    c.save();
    c.globalAlpha = fade;
    c.lineCap = "round";
  }
  // 跳ねた輪：減速しながら広がって、山と同時に止まり、そのまま足もとに残る
  const spread = 1 - (1 - seg(t, 0, TP)) ** 2;
  const R = r.w * RING * spread;
  for (const c of [u, o]) c.lineWidth = r.w * (0.08 - 0.04 * seg(t, 0, TP));
  ellipse2(u, o, cx, base, R, R * 0.26, false);
  const pool = seg(t, 60, 300);
  if (pool > 0) ellipse2(u, o, cx, base, R * 0.75 * pool, R * 0.26 * 0.75 * pool, true);

  const r0 = RING * spread;
  const rise = 1 - (1 - seg(t, 0, TP)) ** 2; // 立ち上がり：上がるほど遅くなる
  const wallH = r.w * WALL * rise;
  // 円柱の面の上の点（角度 ang・帯の上からの高さ y、そこでの半径 rad）を画面に
  const at = (ang: number, y: number, rad: number): [number, number] => [
    cx + rad * Math.cos(ang),
    base - y + 0.26 * rad * Math.sin(ang),
  ];
  // 王冠の帯：跳ねた輪から立ち上がる低い円柱（奥の半分はカードの後ろ、手前の半分は前）
  if (wallH > 0.5) {
    const N = 48;
    for (const [c, a0, a1] of [
      [u, Math.PI, Math.PI * 2],
      [o, 0, Math.PI],
    ] as const) {
      c.beginPath();
      for (let k = 0; k <= N; k++) c.lineTo(...at(a0 + ((a1 - a0) * k) / N, 0, R));
      for (let k = N; k >= 0; k--) c.lineTo(...at(a0 + ((a1 - a0) * k) / N, wallH, R));
      c.closePath();
      c.fill();
    }
  }
  const len = rise;
  const full = Math.max(0, r.h * HEIGHT - r.w * WALL); // 山の高さ（帯の上から）
  const dr = r.w * 0.045;
  const STEPS = 24;
  for (let i = 0; i < PILLARS; i++) {
    // 真正面から 60° おき（正面・左右の手前・左右の奥・真後ろ）。正面から見て 3 つの山が並ぶ
    const th = ((i + 0.5) / PILLARS) * Math.PI * 2;
    const sin = Math.sin(th);
    const c = sin > 0.01 ? o : u;
    if (len <= 0) continue;
    // 三角の山を円柱の面に貼る：根もとは ±BASE_HALF の幅で、先へ行くほど細く（ふちは少し内へ反る）尖る
    const edge = (v: number, side: number): [number, number] => {
      const half = BASE_HALF * (1 - v / len) ** 2.4;
      return at(th + side * half, wallH + full * v, r.w * radiusAt(r0, v));
    };
    c.beginPath();
    for (let j = 0; j <= STEPS; j++) c.lineTo(...edge((j / STEPS) * len, -1));
    for (let j = STEPS; j >= 0; j--) c.lineTo(...edge((j / STEPS) * len, 1));
    c.closePath();
    c.fill();
    // 先の雫の粒
    const [hx, hy] = at(th, wallH + full * len, r.w * radiusAt(r0, len));
    c.beginPath();
    c.arc(hx, hy, dr, 0, Math.PI * 2);
    c.fill();
  }
  for (const c of [u, o]) c.restore();
}
