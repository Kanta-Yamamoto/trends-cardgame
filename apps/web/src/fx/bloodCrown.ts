/**
 * 『演出家』の効果でエースが舞台に上がるときの「血の滴とクラウン」（見た目だけ。ルールは game-core）。
 * 枠の真上から真紅の一滴が重力で落ち → 枠の下のふちで王冠の形に跳ね、とげが上がるほど遅くなって止まる →
 * とげの先の粒が、それぞれツタの先になって、せり上がるエースのまわりを 6 本とも同じ向きに 1/4 周ねじれて上がる
 * （ねじった柱）→ しばらく止まって、溜まりと一緒に全体が消える。
 * とげとツタは真横から 60° おきの等間隔で、形もそろえる（ばらつきは付けない）。とげは地面とつながったまま根もとになる。
 * ツタの奥を通るところはカードの後ろ、手前を通るところはカードの前に描くので、エースを立体的に囲んで見える。
 * 王冠はとなりの枠のカードにかかりすぎないよう、カードの幅より少し広いくらいに収める。
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
/** 王冠のとげ（＝ツタ）の本数と、ツタが根もとから先までに回る角度（1/4 周） */
const SPIKES = 6;
const TURN = Math.PI / 2;
/** カードの幅を 1 としたときの大きさ：跳ねた輪の半径・とげの高さ・ツタが巻く円柱の半径・ツタの先の高さ（カードの高さを 1） */
const RING = 0.64;
const SPIKE = 0.45;
const COIL = 0.56;
const VINE_TOP = 0.8;

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
  const fade = 1 - seg(t, VINE_AT + GROW + HOLD, FADE);
  if (fade <= 0) return;
  for (const c of [u, o]) {
    c.save();
    c.globalAlpha = fade;
    c.lineCap = "round";
  }
  // 跳ねた輪：減速しながら広がって、そのまま足もとに残る（奥の半分はカードの後ろ、手前の半分は前）
  const R = r.w * RING * (1 - (1 - seg(t, 0, TP * 2)) ** 2);
  const RY = R * 0.26;
  const pool = seg(t, 60, 300);
  for (const [c, s0, s1] of [
    [u, Math.PI, Math.PI * 2],
    [o, 0, Math.PI],
  ] as const) {
    c.lineWidth = r.w * (0.08 - 0.04 * seg(t, 0, TP * 2));
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
  const top = r.w * SPIKE;
  const H = top * q;
  const endH = r.h * VINE_TOP;
  const head = 1 - (1 - seg(t, VINE_AT, GROW)) ** 2; // ツタの先：伸びるほど遅くなる
  const dr = r.w * 0.05;
  for (let i = 0; i < SPIKES; i++) {
    // 真横（0°・180°）から 60° おき。手前と奥に 2 本ずつ、左右対称に並ぶ
    const th = (i / SPIKES) * Math.PI * 2;
    const bx = cx + R * Math.cos(th);
    const by = base + RY * Math.sin(th);
    const lean = Math.cos(th) * top * 0.25 * s;
    const tipX = bx + lean;
    const tipY = by - H;
    const bw = r.w * 0.06;
    // とげ：地面とつながったまま残り、ツタの根もとになる
    const sc = Math.sin(th) > 0 ? o : u;
    if (H > 1) {
      sc.beginPath();
      sc.moveTo(bx - bw, by);
      sc.quadraticCurveTo(bx + lean * 0.4, by - H * 0.5, tipX, tipY);
      sc.quadraticCurveTo(bx + lean * 0.4, by - H * 0.5, bx + bw, by);
      sc.fill();
    }
    if (head <= 0) {
      sc.beginPath();
      sc.arc(tipX, tipY, dr, 0, Math.PI * 2);
      sc.fill();
      continue;
    }
    // ツタ：とげの先の粒が先頭になって、円柱のまわりを 1/4 周ねじれながら上へ伸びる
    const startR = R + top * 0.25;
    const path = (v: number): [number, number] => {
      const ang = th + TURN * v;
      const rad = startR + (r.w * COIL - startR) * v;
      return [cx + rad * Math.cos(ang), base - (top + (endH - top) * v) + 0.26 * rad * Math.sin(ang)];
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
    const width = (v: number) => r.w * (0.045 - 0.028 * v);
    const STEPS = 40;
    for (let j = 0; j < STEPS; j++) {
      const v0 = (j / STEPS) * head;
      const v1 = ((j + 1) / STEPS) * head;
      const c = Math.sin(th + TURN * ((v0 + v1) / 2)) > 0 ? o : u;
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
    const hc = Math.sin(th + TURN * head) > 0 ? o : u;
    hc.beginPath();
    hc.arc(hx, hy, dr * (1 - 0.45 * head), 0, Math.PI * 2);
    hc.fill();
  }
  for (const c of [u, o]) c.restore();
}
