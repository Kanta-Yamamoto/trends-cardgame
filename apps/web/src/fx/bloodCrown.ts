/**
 * 『演出家』の効果でエースが舞台に上がるときの「血の滴とクラウン」（見た目だけ。ルールは game-core）。
 * 枠の真上から真紅の一滴が重力で落ち → 枠の下のふちで王冠の形に跳ね、とげが上がるほど遅くなって止まる →
 * とげの先の粒が、それぞれツタの先になって、せり上がるエースのまわりを取り巻くように伸びる
 * （向き・巻き方・高さ・ふくらみは 1 本ずつ違う。とげは地面とつながったまま根もとになる）→
 * しばらく止まって、溜まりと一緒に全体が消える。
 * ツタの奥を通るところはカードの後ろ、手前を通るところはカードの前に描くので、エースを立体的に囲んで見える。
 *
 * ここは形を「塗る」だけ（u＝カードの後ろ、o＝カードの前の 2 枚のキャンバスに、黒で塗る）。
 * 何色で見せるかは DirectorField が決める（背景の地と逆の色＝真紅の上では黒、黒の上では真紅）。
 * 座標はキャンバスのピクセル。a はそのエースの演出が始まってからのミリ秒。
 * 基準のモック：claude.ai の Artifact「『演出家』エース召喚の演出案」
 */

/** 一滴が落ちる時間（止まった状態から重力で加速。重さを出すためゆっくり） */
const FALL = 560;
/** とげが上がり切るまで（投げ上げと同じく、上がるほど遅くなる） */
const TP = 500;
/** 粒がツタになって伸び始める時刻（着地から）・伸び切るまで（伸びるほど遅くなる）・止まっている長さ・消える長さ */
const VINE_AT = TP * 0.92;
const GROW = 1100;
const HOLD = 700;
const FADE = 600;
/** エースがせり上がり始める時刻と長さ */
const RISE_AT = FALL + 80;
const RISE = 620;
/** 演出全体の長さ（全体が消えるまで） */
export const CROWN_MS = FALL + VINE_AT + GROW + HOLD + FADE;
/** 王冠のとげ（＝ツタ）の本数 */
const SPIKES = 8;

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

/** そのエースごとに決まる、とげの高さ・向きのばらつき（毎回同じ形になるように uid から作る） */
export function crownSeed(seed: number): number[] {
  let s = (seed * 2654435761) >>> 0;
  return Array.from({ length: 40 }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  });
}

function drop(c: CanvasRenderingContext2D, x: number, y: number, rad: number, len: number) {
  c.beginPath();
  c.arc(x, y - rad, rad, 0, Math.PI);
  c.quadraticCurveTo(x - rad, y - rad - len * 0.4, x, y - rad - len);
  c.quadraticCurveTo(x + rad, y - rad - len * 0.4, x + rad, y - rad);
  c.fill();
}

export function paintCrown(
  u: CanvasRenderingContext2D,
  o: CanvasRenderingContext2D,
  a: number,
  r: Box,
  rnd: readonly number[],
) {
  if (a < 0) return;
  const cx = r.x + r.w / 2;
  const base = r.y + r.h; // 跳ねるのは枠の下のふち
  // 落ちる一滴：止まった状態から重力で落ちる（落ちた距離は時間の 2 乗）。速くなるほど縦に伸びる
  if (a < FALL) {
    const D = r.h * 2.2;
    const k = a / FALL;
    const rad = r.w * 0.12;
    drop(o, cx, base - D + D * k * k, rad, rad * (1 + 3.2 * k));
    return;
  }
  const t = a - FALL;
  const fade = 1 - seg(t, VINE_AT + GROW + HOLD, FADE);
  if (fade <= 0) return;
  for (const c of [u, o]) {
    c.save();
    c.globalAlpha = fade;
    c.lineCap = "round";
  }
  // 跳ねた輪：減速しながら広がって、そのまま足もとに残る（奥の半分はカードの後ろ、手前の半分は前）
  const R = r.w * 0.85 * (1 - (1 - seg(t, 0, TP * 2)) ** 2);
  const RY = R * 0.26;
  const pool = seg(t, 60, 300);
  for (const [c, s0, s1] of [
    [u, Math.PI, Math.PI * 2],
    [o, 0, Math.PI],
  ] as const) {
    c.lineWidth = r.w * (0.1 - 0.05 * seg(t, 0, TP * 2));
    c.beginPath();
    c.ellipse(cx, base, R, RY, 0, s0, s1);
    c.stroke();
    if (pool > 0) {
      c.beginPath();
      c.ellipse(cx, base, R * 0.75 * pool, RY * 0.75 * pool, 0, s0, s1);
      c.closePath();
      c.fill();
    }
  }
  const s = Math.min(1, t / TP);
  const q = 1 - (1 - s) ** 2; // とげの高さ：投げ上げと同じく、上がるほど遅くなって止まる
  for (let i = 0; i < SPIKES; i++) {
    const th = (i / SPIKES) * Math.PI * 2 + (rnd[i] ?? 0) * 0.35;
    const bx = cx + R * Math.cos(th);
    const by = base + RY * Math.sin(th);
    const top = r.w * (0.45 + 0.4 * (rnd[i + 10] ?? 0));
    const H = top * q;
    const lean = Math.cos(th) * top * 0.35 * s;
    const tipX = bx + lean;
    const tipY = by - H;
    const bw = r.w * 0.07;
    // とげ：地面とつながったまま残り、ツタの根もとになる
    const sc = Math.sin(th) > 0 ? o : u;
    if (H > 1) {
      sc.beginPath();
      sc.moveTo(bx - bw, by);
      sc.quadraticCurveTo(bx + lean * 0.4, by - H * 0.5, tipX, tipY);
      sc.quadraticCurveTo(bx + lean * 0.4, by - H * 0.5, bx + bw, by);
      sc.fill();
    }
    const dr = r.w * 0.06;
    const g = seg(t, VINE_AT + i * 35, GROW);
    if (g <= 0) {
      sc.beginPath();
      sc.arc(tipX, tipY, dr, 0, Math.PI * 2);
      sc.fill();
      continue;
    }
    // ツタ：とげの先の粒が先頭になって、円柱のまわりを回りながら上へ伸びる。1 本ずつ向き・巻き方・高さ・ふくらみが違う
    const dir = (rnd[i + 20] ?? 0) < 0.5 ? -1 : 1;
    const turn = Math.PI * 2 * (0.3 + 0.4 * (rnd[i + 30] ?? 0)) * dir;
    const endH = r.h * (0.7 + 0.45 * (rnd[i + 40] ?? 0));
    const endR = r.w * (0.45 + 0.35 * (rnd[i + 50] ?? 0));
    const wob = (rnd[i + 60] ?? 0) * Math.PI * 2;
    const startR = R + top * 0.35;
    const path = (v: number): [number, number] => {
      const ang = th + turn * v;
      const rad = startR + (endR - startR) * v + r.w * 0.05 * Math.sin(v * Math.PI * 2 + wob);
      const hh = top + (endH - top) * v;
      // 先の 3 割は、巻きひげのようにくるっと丸まる
      const cv = Math.max(0, (v - 0.7) / 0.3);
      const phi = cv * Math.PI * 1.6 * dir;
      const curl = r.w * 0.11 * cv;
      return [
        cx + rad * Math.cos(ang) + curl * (Math.cos(phi) - 1) * dir,
        base - hh + 0.26 * rad * Math.sin(ang) - curl * Math.sin(phi) * dir,
      ];
    };
    // 出だしは、とげの先の位置からなめらかにつなぐ
    const [p0x, p0y] = path(0);
    const ox = tipX - p0x;
    const oy = tipY - p0y;
    const at = (v: number): [number, number] => {
      const [x, y] = path(v);
      const k = (1 - v) ** 2;
      return [x + ox * k, y + oy * k];
    };
    const head = 1 - (1 - g) ** 2; // 伸びるほど遅くなる
    const width = (v: number) => r.w * (0.05 - 0.035 * v);
    const STEPS = 40;
    for (let j = 0; j < STEPS; j++) {
      const v0 = (j / STEPS) * head;
      const v1 = ((j + 1) / STEPS) * head;
      const c = Math.sin(th + turn * ((v0 + v1) / 2)) > 0 ? o : u;
      const [x0, y0] = at(v0);
      const [x1, y1] = at(v1);
      c.lineWidth = width(v1);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    // 先頭は粒のまま、少しずつ細くなる
    const [hx, hy] = at(head);
    const hc = Math.sin(th + turn * head) > 0 ? o : u;
    hc.beginPath();
    hc.arc(hx, hy, dr * (1 - 0.45 * head), 0, Math.PI * 2);
    hc.fill();
  }
  for (const c of [u, o]) c.restore();
}
