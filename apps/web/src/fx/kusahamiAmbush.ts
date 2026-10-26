import { gsap } from "gsap";
import { frameRect } from "../frame";
import "./kusahamiAmbush.css";

/**
 * クサハミが場に出たときの「茂みから飛び出す」演出。ふつうの着地の代わりに見せる
 * （10月26日、オーナーがモック「クサハミの召喚演出」で選んだ案B。斬る直前の溜めを足し、斬ったら草はすぐ消える。そのあと場は戻る）。
 * 1. 草原（0〜1.0 秒）：場の地が暗くなり、出す枠から草原が生えそろう。枠のまわりには背の高い茂みが育つ（茂みはカードより手前）
 * 2. 気配（0.95〜1.35 秒）：茂みの奥で赤い目が 2 つ光り、茂みがざわざわ揺れる
 * 3. 飛び出す（1.35〜1.6 秒）：茂みが左右に割れ、クサハミが上へ飛び上がる
 * 4. 溜め（1.6〜1.96 秒）：空中で体を引き、鎌の先に光が集まる。斬る直前に一瞬止まる
 * 5. 斬る（1.96〜2.07 秒）：枠へ叩きつけ、着地と同時に銀の鎌が斜めに一閃。閃光・揺れ・葉が舞う
 * 6. 草が消える（2.13〜2.7 秒）：茂みは刈られて飛び、草原はなぎ倒されて消える。地の暗さも引いて、いつもの場に戻る
 *
 * 場の後ろの層（field。キャラクターの後ろ）に、地の暗さ・地の色・草原を描き、
 * 画面座標の層（layer）に、カードの写し・茂み・赤い目・鎌の軌跡・舞う葉・閃光を描く。本物のカードは終わるまで隠しておく（呼ぶ側で隠す）。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

/** この演出で場に出るカード（通常の姿のクサハミ。闇の姿は闇堕ちの流れで出るので通らない） */
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

// 時間（ms）
/** 飛び上がり始め */
const LEAP = 1350;
/** 飛び上がり切る＝溜めの始まり */
const APEX = 1600;
/** 溜めの終わり（ここから叩きつける） */
const CHARGE_END = 1960;
/** 着地＝斬る */
const L = 2070;
/** 草が消え始める */
const CLEAR = L + 60;
/** 場が戻り切る */
const CLEAR_END = L + 650;
const END = L + 900;

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
}

/** 草原の 1 本の葉。手前（下）の順に描くので y で並べる */
function buildMeadow(left: number, top: number, width: number, height: number, k: number): Blade[] {
  const r = rng(11);
  const n = Math.round(clamp((width * height) / (k * k * 260), 120, 640));
  const out: Blade[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: left + r() * width,
      y: top + r() * height,
      h: (9 + r() * 11) * k,
      w: (2.2 + r() * 1.6) * k,
      lean0: (r() - 0.5) * 0.6,
      ph: r() * 6.28,
      sh: r(),
      j: r(),
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

/** 斬る直前の溜め：鎌の先に集まる光（十字のきらめきと芯の玉） */
function glint(g: CanvasRenderingContext2D, x: number, y: number, p: number, k: number) {
  if (p <= 0) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  const R = (8 + 24 * p) * k;
  const grd = g.createRadialGradient(x, y, 0, x, y, R);
  grd.addColorStop(0, rgba([255, 255, 255], 0.95 * p));
  grd.addColorStop(0.3, rgba(BLADE, 0.5 * p));
  grd.addColorStop(1, rgba(BLADE, 0));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, R, 0, Math.PI * 2);
  g.fill();
  // 十字の光（溜めるほど長く、細い）
  const len = (12 + 48 * p) * k;
  g.strokeStyle = rgba([255, 255, 255], 0.85 * p);
  g.lineWidth = 1.6 * k;
  g.lineCap = "round";
  for (const an of [0.35, 0.35 + Math.PI / 2]) {
    g.beginPath();
    g.moveTo(x - Math.cos(an) * len, y - Math.sin(an) * len);
    g.lineTo(x + Math.cos(an) * len, y + Math.sin(an) * len);
    g.stroke();
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

/** クサハミの写しの、この瞬間の置き方（y はカードの中心からのずれ。モックのカード幅 66 の座標） */
function pose(t: number) {
  if (t < LEAP) return { op: 0, y: 12, s: 0.8, rot: 0, br: 1 };
  if (t < APEX) {
    const q = eo3(seg(t, LEAP, APEX));
    return { op: seg(t, LEAP, LEAP + 70), y: lerp(12, -74, q), s: lerp(0.8, 1.35, q), rot: 0, br: 1 };
  }
  if (t < CHARGE_END) {
    // 溜め：少し上へ体を引き、後ろへ傾いて、白く光っていく。最後の 60ms は止まる
    const q = eo2(seg(t, APEX, CHARGE_END - 60));
    const bob = Math.sin((t - APEX) / 90) * 1.5 * (1 - q);
    return { op: 1, y: -74 - 7 * q + bob, s: lerp(1.35, 1.44, q), rot: -8 * q, br: lerp(1, 1.45, q) };
  }
  if (t < L) {
    const q = ei3(seg(t, CHARGE_END, L));
    return { op: 1, y: lerp(-81, 0, q), s: lerp(1.44, 1, q), rot: lerp(-8, 4, q), br: lerp(1.45, 2.2, q) };
  }
  // 着地：つぶれて弾んで戻る
  const q = seg(t, L, L + 300);
  const sq = Math.sin(Math.PI * q) * (1 - q);
  return {
    op: 1,
    y: 0,
    s: 1,
    rot: 4 * (1 - eo3(seg(t, L, L + 160))),
    br: lerp(2.2, 1, eo2(seg(t, L, L + 260))),
    sx: 1 + 0.12 * sq,
    sy: 1 - 0.12 * sq,
  };
}

export async function kusahamiAmbush(o: KusahamiAmbushOpts): Promise<void> {
  const { unit, field, layer } = o;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const board = document.querySelector<HTMLElement>(".board");
  const boardTransform = board?.style.transform ?? "";
  const ur = unit.getBoundingClientRect();
  if (ur.width === 0) return;

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
  const meadow = buildMeadow(-5 * kf, meadowTop, FW + 10 * kf, meadowH, kf).map((b) => ({
    ...b,
    d: Math.hypot(b.x - gx, (b.y - gy) * 1.35),
  }));

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
  if (!cu || !co) {
    root.remove();
    veil.remove();
    return;
  }
  const k = ur.width / CARD_W;
  const CX = ur.left + ur.width / 2 - f.left;
  const CY = ur.top + ur.height / 2 - f.top;
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
    // 地の色：出す枠から広がる円
    const gr = Math.min((t - 100) * 0.7 * kf, 520 * kf);
    if (gr > 0 && fa > 0) {
      const grd = cu.createRadialGradient(gx, gy + 30 * kf, 0, gx, gy + 30 * kf, gr);
      grd.addColorStop(0, rgba(GROUND, 0.42 * fa));
      grd.addColorStop(0.82, rgba(GROUND, 0.34 * fa));
      grd.addColorStop(1, rgba(GROUND, 0));
      cu.fillStyle = grd;
      cu.fillRect(0, 0, FW, FH);
    }
    // 草原（奥から手前の順）
    const gn = gone(t);
    for (const b of meadow) {
      const g = back(seg(t, 150 + b.j * 450, 450 + b.j * 450)) * 0.8;
      if (g <= 0.01) continue;
      const sway = 0.1 * Math.sin(t / 520 + b.x / (55 * kf) + b.ph);
      // 着地の衝撃で外へなぎ倒され、そのまま消えていく
      const shock =
        t >= L
          ? Math.sign(b.x - gx || 1) * Math.max(0, 1 - Math.abs(b.d - (t - L) * 0.45 * kf) / (40 * kf)) * 0.8
          : 0;
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
    card.style.transform = `translateY(${p.y * k}px) rotate(${p.rot}deg) scale(${sx}, ${sy})`;
    const glow =
      t >= APEX && t < L + 400
        ? ` drop-shadow(0 0 ${lerp(4, 12, seg(t, APEX, CHARGE_END)) * k}px ${rgba(BLADE, 0.6 * (1 - seg(t, L, L + 400)))})`
        : "";
    card.style.filter = `brightness(${p.br.toFixed(3)})${glow}`;

    // 画面座標の層：茂みの奥 → 赤い目 → 茂みの手前、の順で、目が茂みの中にあるように見せる
    co.clearRect(0, 0, f.width, f.height);
    drawBush(t, (b) => b.y < 40 * k || b.j > 0.3);
    drawEyes(t);
    drawBush(t, (b) => b.y >= 40 * k && b.j <= 0.3);

    // 溜め：鎌の先（カードの右下）に光が集まる
    const ch = seg(t, APEX + 50, CHARGE_END - 30) * (t < CHARGE_END ? 1 : 1 - seg(t, CHARGE_END, L));
    if (ch > 0) glint(co, CX + 30 * k * p.s, CY + (p.y + 30 * p.s) * k, ch, k);

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
    flash.style.opacity = String(t >= L ? 0.16 * (1 - seg(t, L, L + 180)) : 0);
    const shake = t >= L ? (1 - seg(t, L, L + 300)) * 6 * k : 0;
    const shakeT =
      shake > 0 ? `translate(${Math.sin(ts * 210) * shake}px, ${Math.cos(ts * 270) * shake * 0.7}px)` : "";
    root.style.transform = shakeT;
    if (board) board.style.transform = shakeT || boardTransform;
  };

  try {
    render(0);
    await new Promise<void>((resolve) => {
      const st = { t: 0 };
      gsap.to(st, {
        t: END,
        duration: END / 1000,
        ease: "none",
        onUpdate: () => render(st.t),
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  } finally {
    if (board) board.style.transform = boardTransform;
    root.remove();
    field.replaceChildren();
  }
}
