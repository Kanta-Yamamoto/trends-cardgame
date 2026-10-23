/**
 * 『演出家』の効果でエースが舞台に上がるときの「血の滴とクラウン」（見た目だけ。ルールは game-core）。
 * 枠の真上から真紅の一滴が重力で落ち → 枠の下のふちで王冠の形に跳ね、6 本の細い柱が上がるほど遅くなって止まる →
 * 柱がそのまま上へ伸びながら、上へ行くほど弧を描いて外へ開き、跳ねた雫の軌跡が花の形になる（柱どうしはつながない）→
 * しばらく止まって、溜まりと一緒に全体が消える。
 * 柱は真横から 60° おきの等間隔で、ねじらない。地面とつながったまま伸びる。
 * 長さは奥の 2 本がいちばん長く、左右の 2 本はその 7 割、手前の 2 本は 5 割（手前でエースの絵を隠さない）。
 * 奥の柱はカードの後ろ、手前の柱はカードの前に描くので、エースを立体的に囲んで見える。
 *
 * ここは形を「塗る」だけ（u＝カードの後ろ、o＝カードの前の 2 枚のキャンバスに、黒で塗る）。
 * 何色で見せるかは DirectorField が決める（背景の地と逆の色＝真紅の上では黒、黒の上では真紅）。
 * 座標はキャンバスのピクセル。a はそのエースの演出が始まってからのミリ秒。
 * 基準のモック：claude.ai の Artifact「『演出家』エース召喚の演出案」
 */

/** 一滴が落ちる時間（止まった状態から重力で加速。重さを出すためゆっくり） */
const FALL = 560;
/** 柱が王冠の高さまで上がるまで（投げ上げと同じく、上がるほど遅くなる） */
const TP = 500;
/** 柱が上まで伸び始める時刻（着地から）・伸び切るまで（伸びるほど遅くなる）・止まっている長さ・消える長さ */
const GROW_AT = TP * 0.92;
const GROW = 1000;
const HOLD = 800;
const FADE = 600;
/** エースがせり上がり始める時刻と長さ */
const RISE_AT = FALL + 80;
const RISE = 620;
/** 演出全体の長さ（全体が消えるまで） */
export const CROWN_MS = FALL + GROW_AT + GROW + HOLD + FADE;
/** 柱の本数 */
const PILLARS = 6;
/** カードの幅を 1 としたときの大きさ：跳ねた輪の半径・最初に跳ねる柱の高さ。奥の柱の伸び切った高さはカードの高さを 1 として */
const RING = 0.64;
const SPIKE = 0.45;
const TOP = 0.85;

/** 奥の柱を 1 としたときの、左右の柱・手前の柱の長さ */
const SIDE = 0.7;
const FRONT = 0.5;

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

/** 柱の、根もとからの割合 v（0〜1）での円柱の半径（カードの幅を 1 として、根もとの半径 r0 から）。根もとはまっすぐ、上へ行くほど外へ開く */
const radiusAt = (r0: number, v: number) => r0 - 0.04 * v + 0.18 * v * v;

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
  const fade = 1 - seg(t, GROW_AT + GROW + HOLD, FADE);
  if (fade <= 0) return;
  for (const c of [u, o]) {
    c.save();
    c.globalAlpha = fade;
    c.lineCap = "round";
  }
  // 跳ねた輪：減速しながら広がって、そのまま足もとに残る
  const spread = 1 - (1 - seg(t, 0, TP * 2)) ** 2;
  const R = r.w * RING * spread;
  for (const c of [u, o]) c.lineWidth = r.w * (0.08 - 0.04 * seg(t, 0, TP * 2));
  ellipse2(u, o, cx, base, R, R * 0.26, false);
  const pool = seg(t, 60, 300);
  if (pool > 0) ellipse2(u, o, cx, base, R * 0.75 * pool, R * 0.26 * 0.75 * pool, true);

  const r0 = RING * spread;
  const width = (v: number) => r.w * (0.06 - 0.04 * v);
  const dr = r.w * 0.05;
  const STEPS = 24;
  for (let i = 0; i < PILLARS; i++) {
    // 真横（0°・180°）から 60° おき。手前と奥に 2 本ずつ、左右対称に並ぶ
    const th = (i / PILLARS) * Math.PI * 2;
    const sin = Math.sin(th);
    const c = sin > 0.01 ? o : u;
    // 柱の長さ：最初は王冠の高さまで跳ね（上がるほど遅くなる）、そのあと伸び切るまで伸びる（伸びるほど遅くなる）
    const full = r.h * TOP * (sin > 0.01 ? FRONT : sin < -0.01 ? 1 : SIDE);
    const first = Math.min(1, (r.w * SPIKE) / full);
    const len = first * (1 - (1 - seg(t, 0, TP)) ** 2) + (1 - first) * (1 - (1 - seg(t, GROW_AT, GROW)) ** 2);
    if (len <= 0) continue;
    const point = (v: number): [number, number] => {
      const rad = r.w * radiusAt(r0, v);
      return [cx + rad * Math.cos(th), base - full * v + 0.26 * rad * sin];
    };
    for (let j = 0; j < STEPS; j++) {
      const v0 = (j / STEPS) * len;
      const v1 = ((j + 1) / STEPS) * len;
      const [x0, y0] = point(v0);
      const [x1, y1] = point(v1);
      c.lineWidth = width(v1);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    // 先の雫の粒
    const [hx, hy] = point(len);
    c.beginPath();
    c.arc(hx, hy, dr, 0, Math.PI * 2);
    c.fill();
  }
  for (const c of [u, o]) c.restore();
}
