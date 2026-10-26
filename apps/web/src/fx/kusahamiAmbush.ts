import { gsap } from "gsap";
import { frameRect } from "../frame";
import "./kusahamiAmbush.css";

/**
 * クサハミが場に出たときの演出（2 つ。どちらもふつうの着地の代わりに見せる。10月26日、オーナーがモック「クサハミの召喚演出」で選んだ案）。
 *
 * 通常の姿（kusahamiAmbush。案B「茂みから飛び出す」。約 2.7 秒）
 * 1. 草原（0〜1.0 秒）：場の地が暗くなり、出す枠から草原が生えそろう。枠のまわりには背の高い茂みが育つ（茂みはカードより手前）
 * 2. 気配（0.95〜1.35 秒）：茂みの奥で赤い目が 2 つ光り、茂みがざわざわ揺れる
 * 3. 飛び出す（1.35〜1.6 秒）：茂みが左右に割れ、クサハミが上へ飛び上がる
 * 4. 斬る（1.71〜1.82 秒）：枠へ叩きつけ、着地と同時に銀の鎌が斜めに一閃。閃光・揺れ・葉が舞う（斬る前の溜めは作らない。オーナー）
 * 5. 草が消える（1.88〜2.5 秒）：茂みは刈られて飛び、草原はなぎ倒されて消える。地の暗さも引いて、いつもの場に戻る
 *
 * 闇の姿（kusahamiWither。案E「枯れてから毒の茨」。約 3.6 秒。闇堕ちの全画面の演出のあと、場に出るところ）
 * 1. 草原が戻る（0〜0.45 秒）：出す枠からクサハミの草原が生えそろう
 * 2. 枯れる（0.6〜1.3 秒）：草がしおれて茶色く枯れ、枯れ葉が落ちる。場が暗く沈む
 * 3. 降りる（1.25〜1.6 秒）：闇の姿が枠の上に浮かび、叩きつける
 * 4. 着地（1.6 秒）：紫の閃光・大きな揺れ。何重もの紫の衝撃の輪が足もとから広がり、光の筋が放射状に走る
 * 5. 毒の茨（1.6〜2.2 秒）：枯れた草が紫の茨になって、枠から外へ一斉に伸びる。胞子が昇る
 * 6. 場が戻る（2.8〜3.5 秒）：茨・紫の地・暗さが引いて、いつもの場に戻る
 *
 * 場の後ろの層（field。キャラクターの後ろ）に、地の暗さ・地の色・草原を描き、
 * 画面座標の層（layer）に、カードの写し・茂み・赤い目・鎌の軌跡・舞う葉・衝撃の輪・閃光を描く。本物のカードは終わるまで隠しておく（呼ぶ側で隠す）。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

/** この演出で場に出るカード（通常の姿は kusahamiAmbush、闇堕ちで戻る闇の姿は kusahamiWither） */
export const KUSAHAMI_AMBUSH: ReadonlySet<string> = new Set(["c14"]);

export interface KusahamiAmbushOpts {
  /** 場に出たクサハミ（data-uid の要素。最終の位置に置いて隠してある） */
  unit: HTMLElement;
  /** キャラクターの後ろの層（空の要素。中身はここで作る） */
  field: HTMLElement;
  /** 画面座標の演出の層 */
  layer: HTMLElement;
}

type RGB = [number, number, number];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const eo2 = (p: number) => 1 - (1 - p) * (1 - p);
const eo3 = (p: number) => 1 - (1 - p) ** 3;
const ei3 = (p: number) => p ** 3;
const back = (p: number) => 1 + 2.9 * (p - 1) ** 3 + 1.9 * (p - 1) ** 2;
const mix = (a: RGB, b: RGB, p: number): RGB => [
  lerp(a[0], b[0], p),
  lerp(a[1], b[1], p),
  lerp(a[2], b[2], p),
];
const rgba = (c: RGB, a: number) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a)})`;
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 色（モックと同じ）
const GREEN_D: RGB = [26, 84, 46];
const GREEN_L: RGB = [104, 168, 86];
const SILVER: RGB = [214, 236, 222];
const BLADE: RGB = [170, 220, 255];
const GROUND: RGB = [22, 70, 38];
const DRY_GROUND: RGB = [70, 58, 40];
const DRY_D: RGB = [78, 68, 52];
const DRY_L: RGB = [128, 110, 80];
const PURP_D: RGB = [58, 14, 80];
const PURP_L: RGB = [150, 46, 176];
const PURP_TIP: RGB = [246, 128, 255];
const PURP_RING: RGB = [210, 90, 255];
const PURP_GROUND: RGB = [74, 16, 96];

/** モックのカードの幅（座標の倍率の元） */
const CARD_W = 66;

interface Blade {
  x: number;
  y: number;
  h: number;
  w: number;
  lean0: number;
  ph: number;
  sh: number;
  j: number;
  /** 出す枠からの距離（モックの座標。地面は縦につぶれて見えるので y は 1.35 倍） */
  d: number;
  /** 茨になるときのねじれと、伸びる倍率 */
  twist: number;
  tall: number;
}

/** 草原の 1 本の葉。手前（下）の順に描くので y で並べる。d は (gx, gy) からの距離をモックの座標で */
function buildMeadow(
  left: number,
  top: number,
  width: number,
  height: number,
  k: number,
  gx: number,
  gy: number,
): Blade[] {
  const r = rng(11);
  const n = Math.round(clamp((width * height) / (k * k * 260), 120, 640));
  const out: Blade[] = [];
  for (let i = 0; i < n; i++) {
    const x = left + r() * width;
    const y = top + r() * height;
    out.push({
      x,
      y,
      h: (9 + r() * 11) * k,
      w: (2.2 + r() * 1.6) * k,
      lean0: (r() - 0.5) * 0.6,
      ph: r() * 6.28,
      sh: r(),
      j: r(),
      d: Math.hypot(x - gx, (y - gy) * 1.35) / k,
      twist: (r() - 0.5) * 1.4,
      tall: 1.35 + r() * 0.8,
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** 枠のまわりの背の高い茂み（カードより手前）。x・y はカードの中心からのずれ */
function buildBush(k: number): Blade[] {
  const r = rng(23);
  const out: Blade[] = [];
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r());
    const x = Math.cos(a) * 48 * rr * k;
    const y = (28 + Math.sin(a) * 30 * rr) * k;
    out.push({
      x,
      y,
      h: (34 + r() * 34) * k,
      w: (3 + r() * 2.4) * k,
      lean0: x / (140 * k) + (r() - 0.5) * 0.3,
      ph: r() * 6.28,
      sh: r(),
      j: r(),
      d: 0,
      twist: 0,
      tall: 1,
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** 1 本の葉を描く。根もと (x, y) から高さ h、lean だけ傾けて先をとがらせる。先の座標を返す */
function blade(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  w: number,
  lean: number,
  col: RGB,
  a: number,
): [number, number] {
  const tx = x + Math.sin(lean) * h;
  const ty = y - Math.cos(lean) * h;
  const cx = x + Math.sin(lean * 0.45) * h * 0.55;
  const cy = y - Math.cos(lean * 0.45) * h * 0.55;
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.quadraticCurveTo(cx - w * 0.2, cy, tx, ty);
  g.quadraticCurveTo(cx + w * 0.2, cy, x + w / 2, y);
  g.closePath();
  g.fillStyle = rgba(col, a);
  g.fill();
  return [tx, ty];
}

function leaf(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  s: number,
  col: RGB,
  a: number,
) {
  if (a <= 0.01) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.beginPath();
  g.ellipse(0, 0, 4.4, 1.6, 0, 0, Math.PI * 2);
  g.fillStyle = rgba(col, a);
  g.fill();
  g.restore();
}

/** 鎌の軌跡（三日月の形）：中心 (cx, cy)・半径 r の円の a0 → a1 を、真ん中ほど太く塗る */
function crescent(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  thick: number,
  col: RGB,
  a: number,
) {
  const N = 28;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    const an = lerp(a0, a1, q);
    const w = thick * Math.sin(Math.PI * q) ** 0.8;
    g.lineTo(cx + Math.cos(an) * (r + w / 2), cy + Math.sin(an) * (r + w / 2));
  }
  for (let i = N; i >= 0; i--) {
    const q = i / N;
    const an = lerp(a0, a1, q);
    const w = thick * Math.sin(Math.PI * q) ** 0.8;
    g.lineTo(cx + Math.cos(an) * (r - w / 2), cy + Math.sin(an) * (r - w / 2));
  }
  g.closePath();
  g.fillStyle = rgba(col, a);
  g.fill();
}

/** 鎌を振る：p = 0 → 1 で刃先が a0 から a1 へ走り、後ろに残る光が細く消える（p は 1.6 まで） */
function swing(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  p: number,
  thick: number,
) {
  if (p <= 0 || p >= 1.6) return;
  const head = lerp(a0, a1, eo3(Math.min(1, p)));
  const tail = lerp(a0, a1, eo3(clamp((p - 0.25) / 1.1)));
  const fade = 1 - seg(p, 0.9, 1.6);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.shadowColor = rgba(BLADE, 0.9);
  g.shadowBlur = 14;
  crescent(g, cx, cy, r, tail, head, thick, BLADE, 0.55 * fade);
  crescent(g, cx, cy, r, tail, head, thick * 0.45, [255, 255, 255], 0.95 * fade);
  g.restore();
}

/** 床に広がる輪（縦に k 倍つぶした楕円） */
function ellipseRing(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  k: number,
  lw: number,
  col: RGB,
  a: number,
) {
  if (a <= 0.01 || r <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(1, k);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.restore();
  g.lineWidth = lw;
  g.strokeStyle = rgba(col, a);
  g.stroke();
}

/**
 * 闇の姿の着地の衝撃波：何重もの紫の輪が足もとから順に広がり、光の筋が放射状に走る。
 * e は着地からの時間（ms）。k はカードの幅の倍率
 */
function shockwave(g: CanvasRenderingContext2D, x: number, y: number, e: number, k: number) {
  if (e < 0 || e > 900) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  // 輪：4 重。70ms ずつ遅れて出て、外の輪ほど速く遠くへ。先頭の輪は太く明るい
  for (let i = 0; i < 4; i++) {
    const q = seg(e, i * 70, i * 70 + 620);
    if (q <= 0 || q >= 1) continue;
    const r = lerp(16, 200 - i * 22, eo3(q)) * k;
    const a = (1 - q) * (i === 0 ? 1 : 0.8);
    const col = i % 2 === 0 ? PURP_RING : mix(PURP_RING, [255, 220, 255], 0.5);
    ellipseRing(g, x, y, r, 0.4, lerp(i === 0 ? 7 : 4, 1, q) * k, col, a);
    ellipseRing(g, x, y, r, 0.4, lerp(16, 3, q) * k, col, a * 0.22);
  }
  // 光の筋：放射状に 14 本。はじめに勢いよく伸びて、細く消える
  const n = 14;
  const q = seg(e, 0, 380);
  if (q < 1) {
    for (let i = 0; i < n; i++) {
      const an = (i / n) * Math.PI * 2 + 0.2;
      const len = lerp(20, 120, eo3(q)) * k;
      const head = lerp(6, 160, eo3(q)) * k;
      const sx = x + Math.cos(an) * head * 0.9;
      const sy = y + Math.sin(an) * head * 0.9 * 0.4;
      const ex = x + Math.cos(an) * (head * 0.9 + len * 0.6);
      const ey = y + Math.sin(an) * (head * 0.9 + len * 0.6) * 0.4;
      g.strokeStyle = rgba(mix(PURP_RING, [255, 255, 255], 0.4), 0.9 * (1 - q));
      g.lineWidth = lerp(2.4, 0.6, q) * k;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.stroke();
    }
  }
  // 足もとの紫の光だまり：一瞬ふくらんで、しぼむ
  const bl = 1 - seg(e, 0, 520);
  if (bl > 0) {
    const R = lerp(10, 90, eo3(seg(e, 0, 260))) * k;
    const grd = g.createRadialGradient(x, y, 0, x, y, R);
    grd.addColorStop(0, rgba([255, 230, 255], 0.7 * bl));
    grd.addColorStop(0.4, rgba(PURP_RING, 0.4 * bl));
    grd.addColorStop(1, rgba(PURP_RING, 0));
    g.fillStyle = grd;
    g.save();
    g.translate(x, y);
    g.scale(1, 0.4);
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.restore();
    g.fill();
  }
  g.restore();
}

function canvasIn(parent: HTMLElement, w: number, h: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  parent.appendChild(c);
  const g = c.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/** 2 つの層（場の後ろ・画面座標）とカードの写しを用意する。終わったら dispose で片付ける */
function setupLayers(o: KusahamiAmbushOpts) {
  const { unit, field, layer } = o;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const board = document.querySelector<HTMLElement>(".board");
  const boardTransform = board?.style.transform ?? "";
  const ur = unit.getBoundingClientRect();

  // ---- 場の後ろの層（舞台の中の座標。舞台は拡大・縮小しているので、画面の座標から直す）----
  const fr = field.getBoundingClientRect();
  const sc = field.offsetWidth > 0 ? fr.width / field.offsetWidth : 1;
  const FW = field.offsetWidth;
  const FH = field.offsetHeight;
  const kf = ur.width / sc / CARD_W;
  const gx = (ur.left + ur.width / 2 - fr.left) / sc;
  const gy = (ur.top + ur.height / 2 - fr.top) / sc;
  // 草原の範囲：相手の場と自分の場（.pfield）。見つからなければ枠のまわり
  const pf = document.querySelector(".pfield")?.getBoundingClientRect();
  const meadowTop = pf ? (pf.top - fr.top) / sc - 6 * kf : gy - 150 * kf;
  const meadowH = pf ? pf.height / sc + 12 * kf : 300 * kf;
  const veil = document.createElement("div");
  veil.className = "ka-veil";
  field.appendChild(veil);
  const cu = canvasIn(field, FW, FH, dpr);
  const meadow = buildMeadow(-5 * kf, meadowTop, FW + 10 * kf, meadowH, kf, gx, gy);

  // ---- 画面座標の層 ----
  const f = frameRect();
  const root = document.createElement("div");
  root.className = "ka-over";
  Object.assign(root.style, {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  const card = unit.cloneNode(true) as HTMLElement;
  // 場に出たときの落ちてくる動き（.enter）を写しでやり直さないように外す
  card.classList.remove("enter");
  card.classList.add("ka-card");
  card.removeAttribute("data-uid");
  Object.assign(card.style, {
    left: `${ur.left - f.left}px`,
    top: `${ur.top - f.top}px`,
    width: `${ur.width}px`,
    height: `${ur.height}px`,
  });
  root.appendChild(card);
  const co = canvasIn(root, f.width, f.height, dpr);
  const flash = document.createElement("div");
  flash.className = "ka-flash";
  root.appendChild(flash);
  layer.appendChild(root);
  const dispose = () => {
    if (board) board.style.transform = boardTransform;
    root.remove();
    field.replaceChildren();
  };
  const shake = (px: number, ts: number) => {
    const shakeT =
      px > 0 ? `translate(${Math.sin(ts * 210) * px}px, ${Math.cos(ts * 270) * px * 0.7}px)` : "";
    root.style.transform = shakeT;
    if (board) board.style.transform = shakeT || boardTransform;
  };
  return {
    ok: ur.width > 0 && !!cu && !!co,
    cu: cu as CanvasRenderingContext2D,
    co: co as CanvasRenderingContext2D,
    veil,
    card,
    flash,
    meadow,
    FW,
    FH,
    kf,
    gx,
    gy,
    f,
    k: ur.width / CARD_W,
    CX: ur.left + ur.width / 2 - f.left,
    CY: ur.top + ur.height / 2 - f.top,
    dispose,
    shake,
  };
}

/** 時間を GSAP で進めて render を呼ぶ。終わる（または止められる）まで待つ */
function run(end: number, render: (t: number) => void): Promise<void> {
  render(0);
  return new Promise<void>((resolve) => {
    const st = { t: 0 };
    gsap.to(st, {
      t: end,
      duration: end / 1000,
      ease: "none",
      onUpdate: () => render(st.t),
      onComplete: resolve,
      onInterrupt: resolve,
    });
  });
}

/** 出す枠から広がる地の色の円 */
function groundDisc(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  col: RGB,
  a: number,
  w: number,
  h: number,
) {
  if (r <= 0 || a <= 0.01) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, rgba(col, a));
  grd.addColorStop(0.82, rgba(col, a * 0.8));
  grd.addColorStop(1, rgba(col, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}

/* ============================== 通常の姿：茂みから飛び出す ============================== */

// 時間（ms）
/** 飛び上がり始め */
const LEAP = 1350;
/** 飛び上がり切る */
const APEX = 1600;
/** 叩きつけ始め */
const DIVE = 1710;
/** 着地＝斬る */
const L = 1820;
/** 草が消え始める */
const CLEAR = L + 60;
/** 場が戻り切る */
const CLEAR_END = L + 650;
const END = L + 900;

/** クサハミの写しの、この瞬間の置き方（y はカードの中心からのずれ。モックのカード幅 66 の座標） */
function pose(t: number) {
  if (t < LEAP) return { op: 0, y: 12, s: 0.8, br: 1 };
  if (t < APEX) {
    const q = eo3(seg(t, LEAP, APEX));
    return { op: seg(t, LEAP, LEAP + 70), y: lerp(12, -74, q), s: lerp(0.8, 1.35, q), br: 1 };
  }
  // 頂点でわずかに揺れて、すぐ叩きつける
  if (t < DIVE) return { op: 1, y: -74 + 3 * Math.sin((t - APEX) / 30), s: 1.35, br: 1 };
  if (t < L) {
    const q = ei3(seg(t, DIVE, L));
    return { op: 1, y: lerp(-74, 0, q), s: lerp(1.35, 1, q), br: lerp(1, 2.2, q) };
  }
  // 着地：つぶれて弾んで戻る
  const q = seg(t, L, L + 300);
  const sq = Math.sin(Math.PI * q) * (1 - q);
  return {
    op: 1,
    y: 0,
    s: 1,
    br: lerp(2.2, 1, eo2(seg(t, L, L + 260))),
    sx: 1 + 0.12 * sq,
    sy: 1 - 0.12 * sq,
  };
}

export async function kusahamiAmbush(o: KusahamiAmbushOpts): Promise<void> {
  const S = setupLayers(o);
  if (!S.ok) {
    S.dispose();
    return;
  }
  const { cu, co, veil, card, flash, meadow, FW, FH, kf, gx, gy, f, k, CX, CY } = S;
  const bush = buildBush(k);
  const rb = rng(37);
  // 着地で舞い上がる葉と、刈られて飛ぶ茂みの葉
  const burst = Array.from({ length: 16 }, () => {
    const a = -Math.PI * (0.05 + rb() * 0.9);
    return {
      vx: Math.cos(a) * (0.12 + rb() * 0.2) * k,
      vy: Math.sin(a) * (0.16 + rb() * 0.22) * k,
      rot: rb() * 6,
      spin: (rb() - 0.5) * 0.03,
      s: (0.8 + rb() * 0.8) * k,
      c: rb() < 0.35 ? SILVER : GREEN_L,
    };
  });
  const clippings = bush
    .filter((_, i) => i % 2 === 0)
    .map((b) => ({
      x: b.x,
      y: b.y - b.h * 0.7,
      vx: (Math.sign(b.x || 1) * (0.05 + rb() * 0.14) + (rb() - 0.5) * 0.06) * k,
      vy: -(0.1 + rb() * 0.16) * k,
      rot: rb() * 6,
      spin: (rb() - 0.5) * 0.03,
      s: (0.7 + rb() * 0.5) * k,
      t0: CLEAR + rb() * 90,
    }));

  /** 草原が消える割合（0 → 1）。斬ったあと、なぎ倒されながら消える */
  const gone = (t: number) => eo2(seg(t, CLEAR + 60, CLEAR + 460));
  /** 地の暗さ・地の色の残り（1 → 0） */
  const fieldAlpha = (t: number) => 1 - eo3(seg(t, CLEAR + 60, CLEAR_END));

  const drawField = (t: number) => {
    cu.clearRect(0, 0, FW, FH);
    const fa = fieldAlpha(t);
    groundDisc(cu, gx, gy + 30 * kf, Math.min((t - 100) * 0.7 * kf, 520 * kf), GROUND, 0.42 * fa, FW, FH);
    // 草原（奥から手前の順）
    const gn = gone(t);
    for (const b of meadow) {
      const g = back(seg(t, 150 + b.j * 450, 450 + b.j * 450)) * 0.8;
      if (g <= 0.01) continue;
      const sway = 0.1 * Math.sin(t / 520 + b.x / (55 * kf) + b.ph);
      // 着地の衝撃で外へなぎ倒され、そのまま消えていく
      const shock =
        t >= L ? Math.sign(b.x - gx || 1) * Math.max(0, 1 - Math.abs(b.d - (t - L) * 0.45) / 40) * 0.8 : 0;
      const lean = b.lean0 + sway + shock + Math.sign(b.x - gx || 1) * 1.1 * gn;
      const h = b.h * g * (1 - 0.5 * gn);
      const a = 0.92 * (1 - gn);
      if (a <= 0.01) continue;
      const [tx, ty] = blade(cu, b.x, b.y, h, b.w, lean, mix(GREEN_D, GREEN_L, b.sh), a);
      if (b.sh > 0.66) {
        cu.fillStyle = rgba(SILVER, 0.5 * a * g);
        cu.fillRect(tx - 0.7 * kf, ty - 0.7 * kf, 1.4 * kf, 1.4 * kf);
      }
    }
  };

  const drawBush = (t: number, pick: (b: Blade) => boolean) => {
    for (const b of bush) {
      if (!pick(b)) continue;
      const g = back(seg(t, 300 + b.j * 300, 700 + b.j * 300));
      if (g <= 0.01) continue;
      // 刈られる：斬った直後に根もとから短くなって消える
      const cut = eo2(seg(t, CLEAR + b.j * 60, CLEAR + 160 + b.j * 60));
      if (cut >= 1) continue;
      const rustle = t > 900 && t < LEAP ? 0.16 * Math.sin(t / 70 + b.ph) : 0.06 * Math.sin(t / 500 + b.ph);
      const part = Math.sign(b.x || 1) * 1.05 * eo3(seg(t, LEAP, LEAP + 170));
      const lean = b.lean0 + rustle + part + Math.sign(b.x || 1) * 0.5 * cut;
      blade(
        co,
        CX + b.x,
        CY + b.y,
        b.h * g * (1 - cut),
        b.w,
        lean,
        mix(GREEN_D, GREEN_L, b.sh * 0.8),
        0.95 * (1 - cut),
      );
    }
  };

  const drawEyes = (t: number) => {
    const o = seg(t, 950, 1050) * (1 - seg(t, 1330, 1380));
    if (o <= 0) return;
    const blink = t > 1180 && t < 1230 ? 0.15 : 1;
    co.save();
    co.globalCompositeOperation = "lighter";
    for (const dx of [-8, 8]) {
      const x = CX + dx * k;
      const y = CY + 4 * k;
      const grd = co.createRadialGradient(x, y, 0, x, y, 12 * k);
      grd.addColorStop(0, `rgba(255,60,60,${0.8 * o})`);
      grd.addColorStop(1, "rgba(255,0,0,0)");
      co.fillStyle = grd;
      co.fillRect(x - 12 * k, y - 12 * k, 24 * k, 24 * k);
      co.save();
      co.translate(x, y);
      co.rotate(dx < 0 ? 0.35 : -0.35);
      co.scale(1, 0.45 * blink);
      co.beginPath();
      co.arc(0, 0, 3.6 * k, 0, Math.PI * 2);
      co.globalCompositeOperation = "source-over";
      co.fillStyle = `rgba(255,40,48,${o})`;
      co.fill();
      co.restore();
    }
    co.restore();
  };

  const render = (t: number) => {
    const ts = t / 1000;
    // 地の暗さ（草原と一緒に引く）
    veil.style.opacity = String(0.48 * eo3(seg(t, 0, 400)) * fieldAlpha(t));
    drawField(t);

    // カードの写し
    const p = pose(t);
    const sx = (p.sx ?? 1) * p.s;
    const sy = (p.sy ?? 1) * p.s;
    card.style.opacity = String(p.op);
    card.style.transform = `translateY(${p.y * k}px) scale(${sx}, ${sy})`;
    const glow =
      t >= DIVE && t < L + 400
        ? ` drop-shadow(0 0 ${10 * k}px ${rgba(BLADE, 0.6 * (1 - seg(t, L, L + 400)))})`
        : "";
    card.style.filter = `brightness(${p.br.toFixed(3)})${glow}`;

    // 画面座標の層：茂みの奥 → 赤い目 → 茂みの手前、の順で、目が茂みの中にあるように見せる
    co.clearRect(0, 0, f.width, f.height);
    drawBush(t, (b) => b.y < 40 * k || b.j > 0.3);
    drawEyes(t);
    drawBush(t, (b) => b.y >= 40 * k && b.j <= 0.3);

    // 斬る：着地と同時に、斜めに一閃
    swing(co, CX + 10 * k, CY + 70 * k, 120 * k, -2.4, -0.55, seg(t, L, L + 280) * 1.6, 11 * k);

    // 舞う葉：着地で舞い上がる分と、刈られた茂みの分
    const e = t - L;
    if (e >= 0 && e < 900) {
      for (const l of burst) {
        const x = CX + l.vx * e;
        const y = CY + 20 * k + l.vy * e + 0.00012 * k * e * e;
        leaf(co, x, y, l.rot + e * l.spin, l.s, l.c, 0.9 * (1 - seg(e, 450, 900)));
      }
    }
    for (const c of clippings) {
      const ce = t - c.t0;
      if (ce < 0 || ce > 700) continue;
      const x = CX + c.x + c.vx * ce;
      const y = CY + c.y + c.vy * ce + 0.00014 * k * ce * ce;
      leaf(co, x, y, c.rot + ce * c.spin, c.s, mix(GREEN_L, SILVER, 0.3), 0.9 * (1 - seg(ce, 350, 700)));
    }

    // 閃光と揺れ（着地の瞬間）
    flash.style.background = "#eaf6ff";
    flash.style.opacity = String(t >= L ? 0.16 * (1 - seg(t, L, L + 180)) : 0);
    S.shake(t >= L ? (1 - seg(t, L, L + 300)) * 6 * k : 0, ts);
  };

  try {
    await run(END, render);
  } finally {
    S.dispose();
  }
}

/* ============================== 闇の姿：枯れてから毒の茨 ============================== */

// 時間（ms）
/** 着地 */
const WL = 1600;
/** 場が戻る [始め, 終わり] */
const WRET: readonly [number, number] = [2800, 3500];
const WEND = 3600;

/** 闇の姿の写しの、この瞬間の置き方：浮かぶ → 叩きつける → つぶれて戻る（モックの dropIn） */
function dropIn(t: number, t0: number, hoverMs: number, lift: number, sMax: number) {
  if (t < t0 - hoverMs) return { op: 0, y: 0, s: 0.9, br: 1 };
  if (t < t0 - 110) {
    const q = eo3(seg(t, t0 - hoverMs, t0 - 160));
    return { op: q, y: -lift * q, s: lerp(0.9, sMax, q), br: 1 };
  }
  if (t < t0) {
    const q = ei3(seg(t, t0 - 110, t0));
    return { op: 1, y: lerp(-lift, 0, q), s: lerp(sMax, 1, q), br: lerp(1, 2.2, q) };
  }
  const q = seg(t, t0, t0 + 300);
  const sq = Math.sin(Math.PI * q) * (1 - q);
  return {
    op: 1,
    y: 0,
    s: 1,
    br: lerp(2.2, 1, eo2(seg(t, t0, t0 + 260))),
    sx: 1 + 0.12 * sq,
    sy: 1 - 0.12 * sq,
  };
}

/**
 * 闇堕ちで戻る毒草喰らいのクサハミが場に出るときの演出（案E）。
 * 闇堕ちの全画面の演出（DarkCutscene）のあと、ふつうの着地と裏返しの代わりに見せる
 */
export async function kusahamiWither(o: KusahamiAmbushOpts): Promise<void> {
  const S = setupLayers(o);
  if (!S.ok) {
    S.dispose();
    return;
  }
  const { cu, co, veil, card, flash, meadow, FW, FH, kf, gx, gy, f, k, CX, CY } = S;
  const rd = rng(41);
  // 落ちる枯れ葉（画面座標。草原の範囲に降る）
  const pf = document.querySelector(".pfield")?.getBoundingClientRect();
  const top = (pf ? pf.top : CY - 150 * k) - f.top;
  const bottom = (pf ? pf.bottom : CY + 150 * k) - f.top;
  const dead = Array.from({ length: 26 }, () => ({
    t0: 650 + rd() * 700,
    x: rd() * f.width,
    y0: top + rd() * (bottom - top) * 0.6,
    vy: (0.05 + rd() * 0.05) * k,
    amp: (5 + rd() * 8) * k,
    ph: rd() * 6,
    rot: rd() * 6,
    spin: (rd() - 0.5) * 0.01,
    s: (0.8 + rd() * 0.6) * k,
  }));
  const rs = rng(43);
  // 胞子（着地のあと、茨の上をゆっくり昇る）
  const spores = Array.from({ length: 70 }, () => ({
    x: rs() * f.width,
    y: top + 20 * k + rs() * (bottom - top),
    t0: rs() * 1400,
    life: 1200 + rs() * 900,
    vy: (0.02 + rs() * 0.035) * k,
    amp: (3 + rs() * 6) * k,
    ph: rs() * 6,
    s: (0.8 + rs() * 1.6) * k,
  }));

  /** 場の残り（1 → 0）：茨・紫の地・暗さが引いて戻る */
  const fieldAlpha = (t: number) => 1 - eo3(seg(t, WRET[0], WRET[1]));

  const drawField = (t: number) => {
    cu.clearRect(0, 0, FW, FH);
    const fa = fieldAlpha(t);
    const dr = seg(t, 600, 1300);
    groundDisc(
      cu,
      gx,
      gy + 30 * kf,
      Math.min(t * 0.9 * kf, 520 * kf),
      mix(GROUND, DRY_GROUND, dr),
      0.42 * fa,
      FW,
      FH,
    );
    groundDisc(cu, gx, gy + 30 * kf, Math.min((t - WL) * 0.55 * kf, 560 * kf), PURP_GROUND, 0.5 * fa, FW, FH);
    for (const b of meadow) {
      // 戻ってくる → 枯れる → 着地から外へ順に、紫の茨になって伸びる
      const g = eo3(seg(t, b.d * 0.6, b.d * 0.6 + 260));
      if (g <= 0.01) continue;
      let dry = eo3(seg(t, 600 + b.j * 300, 1000 + b.j * 300));
      const re = seg(t, WL + b.d / 0.55, WL + b.d / 0.55 + 230);
      const pur = re;
      const thorn = back(re);
      dry *= 1 - re;
      let amp = lerp(0.1, 0.03, dry);
      let freq = 520;
      if (pur > 0.4) {
        amp = Math.max(amp, 0.2 * pur);
        freq = 300;
      }
      const sway = amp * Math.sin(t / freq + b.x / (55 * kf) + b.ph);
      const lean = b.lean0 + sway + dry * Math.sign(b.lean0 || 1) * 1.0 + thorn * b.twist * 0.6;
      const h = b.h * g * (1 - 0.45 * dry) * (1 + (b.tall - 1) * thorn);
      let col = mix(GREEN_D, GREEN_L, b.sh);
      col = mix(col, mix(DRY_D, DRY_L, b.sh), dry);
      col = mix(col, mix(PURP_D, PURP_L, b.sh), pur);
      const [tx, ty] = blade(cu, b.x, b.y, h, b.w * (1 - 0.3 * thorn), lean, col, 0.92 * fa);
      // 先の光：通常は銀、毒は紫に灯る
      if (b.sh > 0.66) {
        if (pur > 0.5) {
          const fl = 0.6 + 0.4 * Math.sin(t / 120 + b.ph);
          cu.fillStyle = rgba(PURP_TIP, (pur - 0.5) * 2 * fl * fa);
          cu.fillRect(tx - 1.2 * kf, ty - 1.2 * kf, 2.4 * kf, 2.4 * kf);
        } else if (dry < 0.3 && pur < 0.2) {
          cu.fillStyle = rgba(SILVER, 0.5 * fa * g);
          cu.fillRect(tx - 0.7 * kf, ty - 0.7 * kf, 1.4 * kf, 1.4 * kf);
        }
      }
    }
  };

  const render = (t: number) => {
    const ts = t / 1000;
    const fa = fieldAlpha(t);
    veil.style.opacity = String(lerp(0.3, 0.62, seg(t, 600, 1300)) * eo3(seg(t, 0, 300)) * fa);
    drawField(t);

    // カードの写し
    const p = dropIn(t, WL, 350, 54, 1.32);
    const sx = (p.sx ?? 1) * p.s;
    const sy = (p.sy ?? 1) * p.s;
    card.style.opacity = String(p.op);
    card.style.transform = `translateY(${p.y * k}px) scale(${sx}, ${sy})`;
    const glow =
      t >= WL - 350 && t < WL + 600
        ? ` drop-shadow(0 0 ${12 * k}px ${rgba(PURP_RING, 0.7 * (1 - seg(t, WL + 200, WL + 600)))})`
        : "";
    card.style.filter = `brightness(${p.br.toFixed(3)})${glow}`;

    co.clearRect(0, 0, f.width, f.height);
    // 枯れ葉：ひらひらと落ちる（着地のころには消える）
    for (const l of dead) {
      const e = t - l.t0;
      if (e < 0) continue;
      const y = l.y0 + e * l.vy;
      if (y > bottom + 10 * k) continue;
      leaf(
        co,
        l.x + Math.sin(e / 260 + l.ph) * l.amp,
        y,
        l.rot + e * l.spin + Math.sin(e / 300) * 0.8,
        l.s,
        DRY_L,
        0.8 * (1 - seg(t, WL, WL + 300)) * fa,
      );
    }
    // 着地の衝撃波（足もと）
    shockwave(co, CX, CY + 30 * k, t - WL, k);
    // 胞子
    if (t >= WL) {
      co.save();
      co.globalCompositeOperation = "lighter";
      for (const s of spores) {
        const e = t - WL - s.t0;
        if (e < 0) continue;
        const life = e % s.life;
        const a = Math.sin((Math.PI * life) / s.life);
        co.fillStyle = rgba(PURP_TIP, 0.7 * a * fa);
        co.beginPath();
        co.arc(s.x + Math.sin(e / 400 + s.ph) * s.amp, s.y - life * s.vy, s.s, 0, Math.PI * 2);
        co.fill();
      }
      co.restore();
    }

    // 紫の閃光と大きな揺れ（着地の瞬間）
    flash.style.background = "#9628d2";
    flash.style.opacity = String(t >= WL ? 0.22 * (1 - seg(t, WL, WL + 220)) : 0);
    S.shake(t >= WL ? (1 - seg(t, WL, WL + 340)) * 7 * k : 0, ts);
  };

  try {
    await run(WEND, render);
  } finally {
    S.dispose();
  }
}
