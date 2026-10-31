import { gsap } from "gsap";
import { frameRect } from "../frame";
import { playSe } from "../sound/se";
import "./godDescent.css";

/**
 * ネ申（13 コストの神）が場に出たときの降臨の演出。ふつうの着地の代わりに見せる（10月25日、オーナーがモックで選んだ形）。
 * 1. 溜め（0〜1 秒）：場の地が暗くなり、天から光が差し込む。足もとに金の円陣が描かれていく。小さく地鳴り
 * 2. 降臨（1.1〜2.35 秒）：真っ白に光った神が画面の上から大きくゆっくり降りてきて、一瞬溜めて叩きつける
 * 3. 衝撃（2.35 秒）：白い閃光・大きな揺れ・円陣が弾けて衝撃の輪と光の粒
 * 4. 後光と神の場（〜3.3 秒）：背中から光の筋が開いて回り、場が白金（中心が白・ふちが金）に染まる
 * 5. 授与（3.35〜4.15 秒）：神の体から光の玉が抜け出し、画面の真ん中で弾けて加えるカードになる
 * 6. 見せる（〜5.05 秒）：大きく並べて止め、光を走らせる（何をもらったか分かる間）
 * 7. 手札へ（5.05 秒〜）：1枚ずつ手札に入る
 * 8. 場が戻る（5.9〜6.7 秒）：場の色・後光・円陣が引いて、いつもの場に戻る
 *
 * 場の後ろの層（field。キャラクターの後ろ）に、地の色・円陣・光の柱・後光を描き、
 * 画面座標の層（over）に、光の玉・光の粒・閃光と、加えるカード（gifts）を置く。神のカードそのもの（unit）は直接動かす。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

/** この演出で場に出るカード */
export const GOD_DESCENT_CARDS: ReadonlySet<string> = new Set(["g20"]);

export interface GodDescentOpts {
  /** 場に出た神（data-uid の要素。最終の位置に置いて隠してある） */
  unit: HTMLElement;
  /** キャラクターの後ろの層（空の要素。中身はここで作る） */
  field: HTMLElement;
  /** 画面座標の層（中に gifts が入っている） */
  over: HTMLElement;
  /** 大きく見せる、手札に加えるカード */
  gifts: HTMLElement[];
  /**
   * i 枚目を手札に加える（state を進める）。加わった手札のカードの要素（隠しておく）か、
   * 相手なら手札の数の札を返す。飛んで着いたら見せる
   */
  toHand: (i: number) => Promise<HTMLElement | null>;
  mine: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const eo3 = (p: number) => 1 - (1 - p) ** 3;
const ei4 = (p: number) => p ** 4;
const eio = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const back = (p: number) => 1 + 3.2 * (p - 1) ** 3 + 2.2 * (p - 1) ** 2;
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, p: number): RGB => [
  lerp(a[0], b[0], p),
  lerp(a[1], b[1], p),
  lerp(a[2], b[2], p),
];
const rgba = (c: RGB, a: number) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1)})`;

// 時間（ms）
const IMPACT = 2350;
const EMIT = [3350, 3490, 3630];
const TRAVEL = 460;
const HOLD_END = 5050;
const FLY = 520;
const FLY_GAP = 130;
const FADE = [5900, 6700] as const;
const END = 6700;

const r1 = rng(7);
const MOTES = Array.from({ length: 26 }, () => ({
  b: 300 + r1() * 1900,
  x: (r1() - 0.5) * 1.6,
  y: (r1() - 0.5) * 1.6,
  s: 1.2 + r1() * 1.6,
  up: 50 + r1() * 50,
}));
const r2 = rng(11);
const SPARKS = Array.from({ length: 50 }, () => ({
  a: r2() * Math.PI * 2,
  v: 120 + r2() * 280,
  life: 450 + r2() * 450,
  d: r2() * 60,
  up: 60 + r2() * 170,
}));
const r3 = rng(23);
const DUST = Array.from({ length: 34 }, () => ({
  x: r3(),
  y: r3(),
  v: 0.008 + r3() * 0.02,
  s: 1 + r3() * 2,
  ph: r3() * 6,
}));
const r4 = rng(5);
const CLOUDS = Array.from({ length: 9 }, (_, i) => ({
  x: i < 5 ? i / 4 : i % 2 ? -0.05 : 1.05,
  y: i < 5 ? 0.09 + r4() * 0.09 : 0.27 + r4() * 0.28,
  r: 70 + r4() * 60,
  ph: r4() * 6,
}));

function canvasIn(parent: HTMLElement, w: number, h: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  parent.appendChild(c);
  const ctx = c.getContext("2d");
  return { c, ctx };
}

export async function godDescent(o: GodDescentOpts): Promise<void> {
  const { unit, field, over, gifts, mine } = o;
  setTimeout(() => playSe("godEntry"), IMPACT);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const board = document.querySelector<HTMLElement>(".board");

  // ---- 場の後ろの層（舞台の中の座標。舞台は拡大・縮小しているので、画面の座標から直す）----
  const fr = field.getBoundingClientRect();
  const sc = field.offsetWidth > 0 ? fr.width / field.offsetWidth : 1;
  const FW = field.offsetWidth;
  const FH = field.offsetHeight;
  const ur = unit.getBoundingClientRect();
  const gx = (ur.left + ur.width / 2 - fr.left) / sc;
  const gy = (ur.top + ur.height / 2 - fr.top) / sc;
  /** モック（カードの幅 66）からの倍率 */
  const k = ur.width / sc / 66;
  const circ = { x: gx, y: gy + 32 * k, R: 122 * k, k: 0.36 };
  const veil = document.createElement("div");
  veil.className = "gd-veil";
  const ground = document.createElement("div");
  ground.className = "gd-ground";
  ground.style.setProperty("--gx", `${(gx / FW) * 100}%`);
  ground.style.setProperty("--gy", `${(gy / FH) * 100}%`);
  const tex = document.createElement("div");
  tex.className = "gd-tex";
  tex.style.setProperty("--gx", `${(gx / FW) * 100}%`);
  tex.style.setProperty("--gy", `${(gy / FH) * 100}%`);
  field.append(veil, ground, tex);
  const { ctx: cu } = canvasIn(field, FW, FH, dpr);

  // ---- 画面座標の層 ----
  const f = frameRect();
  const ov = document.createElement("div");
  ov.className = "gd-over";
  Object.assign(ov.style, {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  const { c: overCanvas, ctx: co } = canvasIn(ov, f.width, f.height, dpr);
  overCanvas.className = "gd-over-canvas";
  const flash = document.createElement("div");
  flash.className = "gd-flash";
  // 見せる間、3枚の後ろを暗くして浮かせる（明るい神の場の上でも読めるように）
  const backdrop = document.createElement("div");
  backdrop.className = "gd-backdrop";
  ov.append(backdrop, flash);
  over.prepend(ov);
  if (!cu || !co) return;

  // 画面座標での神の位置と大きさ
  const sx = ur.left + ur.width / 2 - f.left;
  const sy = ur.top + ur.height / 2 - f.top;
  const ks = ur.width / 66;
  const sCirc = { x: sx, y: sy + 32 * ks, R: 122 * ks, k: 0.36 };
  // 大きく見せる位置：画面の真ん中に3枚。高さは相手の場と自分の場の間
  const GW = Math.min(f.width * 0.3, 150);
  const GH = (GW * 88) / 63;
  const rows = document.querySelector(".pfield")?.getBoundingClientRect();
  const upY = rows ? rows.top + rows.height / 2 - f.top : f.height * 0.4;
  const upX = [-1, 0, 1].map((d) => f.width / 2 + d * (GW + 10));
  ov.style.setProperty("--gd-up", `${(upY / f.height) * 100}%`);
  for (const g of gifts) {
    Object.assign(g.style, { width: `${GW}px`, left: `${f.left}px`, top: `${f.top}px`, opacity: "0" });
  }
  // 手札へ飛んでいるカード（このあいだは描画から外す）と、最後に置いた位置
  const flying = gifts.map(() => false);
  const last = gifts.map(() => ({ x: sx, y: sy, s: 0.3 }));
  const placeGift = (i: number, x: number, y: number, s: number, op: number, ry = 0, b = 1, glowA = 0) => {
    const g = gifts[i];
    if (!g) return;
    last[i] = { x, y, s };
    g.style.transform = `translate(${x - GW / 2}px,${y - GH / 2}px) perspective(800px) rotateY(${ry}deg) scale(${s})`;
    g.style.opacity = String(op);
    g.style.filter = b !== 1 ? `brightness(${b})` : "";
    g.style.boxShadow = glowA > 0 ? `0 0 22px 3px rgba(255,214,110,${glowA}), 0 16px 30px -14px #000` : "";
  };

  const after = (t: number) => 1 - seg(t, FADE[0], FADE[1]);
  const fieldOn = (t: number) => eo3(seg(t, IMPACT, IMPACT + 750)) * after(t);

  // 円陣：外の二重の輪 → 目盛り → 中の輪と六芒星 → 内の輪とスポーク。path は傾けた座標で作り、線は画面の太さで引く
  const drawCircle = (ctx: CanvasRenderingContext2D, t: number, alpha: number, scale: number, fo: number) => {
    if (alpha <= 0) return;
    const { x, y, R, k: kk } = circ;
    const rot = t * 0.00022;
    const col = mix([255, 228, 150], [176, 124, 22], fo);
    const glw = mix([255, 205, 90], [255, 240, 190], fo);
    const P = (fn: () => void, rr: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale * kk);
      ctx.rotate(rr);
      ctx.beginPath();
      fn();
      ctx.restore();
    };
    ctx.save();
    ctx.shadowColor = rgba(glw, alpha);
    ctx.shadowBlur = 10 * k;
    ctx.strokeStyle = rgba(col, alpha);
    const lw = 1.7 * k;
    ctx.lineWidth = lw;
    const gfill = seg(t, 700, 1500) * 0.5;
    if (gfill > 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, kk);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * scale);
      rg.addColorStop(0, rgba([255, 246, 210], gfill * alpha));
      rg.addColorStop(0.7, rgba([255, 214, 110], gfill * alpha * 0.35));
      rg.addColorStop(1, rgba([255, 214, 110], 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, R * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const p1 = seg(t, 300, 850);
    if (p1 > 0) {
      P(() => ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + p1 * Math.PI * 2), rot);
      ctx.stroke();
      P(() => ctx.arc(0, 0, R - 5 * k, -Math.PI / 2, -Math.PI / 2 + p1 * Math.PI * 2), rot);
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      ctx.lineWidth = lw;
    }
    const pt = seg(t, 850, 1250);
    if (pt > 0) {
      const n = Math.floor(72 * pt);
      P(() => {
        for (let i = 0; i < n; i++) {
          const a = (i / 72) * Math.PI * 2;
          const ra = R - 9 * k;
          const rb = i % 6 === 0 ? R - 19 * k : R - 14 * k;
          ctx.moveTo(Math.cos(a) * ra, Math.sin(a) * ra);
          ctx.lineTo(Math.cos(a) * rb, Math.sin(a) * rb);
        }
      }, rot);
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      ctx.lineWidth = lw;
    }
    const r2 = R * 0.72;
    const p2 = seg(t, 450, 1000);
    if (p2 > 0) {
      P(() => ctx.arc(0, 0, r2, Math.PI / 2, Math.PI / 2 - p2 * Math.PI * 2, true), -rot * 1.6);
      ctx.stroke();
    }
    const ps = seg(t, 750, 1250);
    if (ps > 0) {
      P(() => {
        for (let tri = 0; tri < 2; tri++) {
          const pts = [0, 1, 2, 3].map((j) => {
            const a = -Math.PI / 2 + tri * Math.PI + (j * Math.PI * 2) / 3;
            return [Math.cos(a) * r2, Math.sin(a) * r2] as const;
          });
          const first = pts[0] as readonly [number, number];
          ctx.moveTo(first[0], first[1]);
          for (let e = 0; e < 3; e++) {
            const q = clamp(ps * 3 - e, 0, 1);
            if (q <= 0) break;
            const a = pts[e] as readonly [number, number];
            const b = pts[e + 1] as readonly [number, number];
            ctx.lineTo(lerp(a[0], b[0], q), lerp(a[1], b[1], q));
          }
        }
      }, -rot * 1.6);
      ctx.stroke();
      if (ps >= 1) {
        P(() => {
          for (let j = 0; j < 6; j++) {
            const a = -Math.PI / 2 + (j * Math.PI) / 3;
            const cx = Math.cos(a) * r2;
            const cy = Math.sin(a) * r2;
            ctx.moveTo(cx + 5 * k, cy);
            ctx.arc(cx, cy, 5 * k, 0, Math.PI * 2);
          }
        }, -rot * 1.6);
        ctx.stroke();
      }
    }
    const r3 = R * 0.34;
    const p3 = seg(t, 650, 1050);
    if (p3 > 0) {
      P(() => ctx.arc(0, 0, r3, 0, p3 * Math.PI * 2), rot * 2);
      ctx.stroke();
    }
    const psp = seg(t, 900, 1300);
    if (psp > 0) {
      P(() => {
        for (let j = 0; j < 12; j++) {
          const a = (j / 12) * Math.PI * 2;
          const rr = lerp(r3, r2, psp);
          ctx.moveTo(Math.cos(a) * r3, Math.sin(a) * r3);
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      }, rot * 2);
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
    }
    ctx.restore();
  };

  const ring = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    kk: number,
    lw: number,
    color: string,
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, kk);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.restore();
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  const orbAt = (i: number, p: number) => {
    const q = eio(p);
    const P0 = [sx, sy - 10 * ks];
    const C = [sx + (i - 1) * 95 * ks, sy - 175 * ks];
    const P1 = [upX[i] ?? sx, upY];
    const b = (j: 0 | 1) =>
      (1 - q) ** 2 * (P0[j] as number) + 2 * (1 - q) * q * (C[j] as number) + q * q * (P1[j] as number);
    return [b(0), b(1)] as const;
  };

  const render = (t: number) => {
    // ---- 神のカード ----
    let y = 0;
    let s = 1;
    let b = 1;
    let op = t >= 1100 ? 1 : 0;
    let sqx = 1;
    let sqy = 1;
    const startY = -(gy + 150 * k);
    if (t < 2000) {
      const p = eio(seg(t, 1100, 2000));
      y = lerp(startY, -48 * k, p);
      s = lerp(2.6, 1.45, p);
      b = lerp(4.5, 1.8, p);
      op = seg(t, 1100, 1300);
    } else if (t < 2250) {
      const q = eo3(seg(t, 2000, 2250));
      y = -50 * k - 10 * k * q;
      s = 1.47 + 0.07 * q;
      b = 1.8 + 0.6 * q;
    } else if (t < IMPACT) {
      const q = ei4(seg(t, 2250, IMPACT));
      y = lerp(-60 * k, 0, q);
      s = lerp(1.54, 1, q);
      b = 2.4;
    } else {
      const hit = t < IMPACT + 50 ? 1 : 1 - back(seg(t, IMPACT + 50, IMPACT + 400));
      sqx = 1 + 0.12 * hit;
      sqy = 1 - 0.12 * hit;
      b = lerp(3, 1.12, seg(t, IMPACT, IMPACT + 650));
    }
    for (const e of EMIT) if (t > e) b += 0.9 * (1 - seg(t, e, e + 260));
    const pulse = t >= IMPACT ? (0.6 + 0.25 * Math.sin(t * 0.006)) * after(t) : 0;
    gsap.set(unit, {
      y,
      scaleX: s * sqx,
      scaleY: s * sqy,
      opacity: op,
      zIndex: 30,
      filter: `brightness(${b.toFixed(3)})`,
      boxShadow:
        pulse > 0
          ? `0 0 ${14 + 8 * pulse}px ${3 + 3 * pulse}px rgba(255,214,110,${0.55 * pulse + 0.15 * after(t)})`
          : t >= 1100 && t < IMPACT
            ? "0 0 30px 8px rgba(255,248,220,.7)"
            : "none",
    });

    // ---- 揺れ・暗さ・神の場・閃光 ----
    const amp =
      ((t < IMPACT ? 1.4 * seg(t, 400, 1500) : 0) +
        (t >= IMPACT ? 12 * (1 - seg(t, IMPACT, IMPACT + 650)) ** 2 : 0)) *
      k;
    if (board) gsap.set(board, { x: amp * Math.sin(t * 0.11), y: amp * 0.8 * Math.cos(t * 0.153) });
    veil.style.opacity = String(0.62 * eo3(seg(t, 0, 600)) * (1 - seg(t, IMPACT, IMPACT + 320)));
    const firstArrive = (EMIT[0] ?? 0) + TRAVEL;
    backdrop.style.opacity = String(
      0.85 * eo3(seg(t, firstArrive - 200, firstArrive + 200)) * (1 - seg(t, HOLD_END, HOLD_END + 400)),
    );
    const fo = fieldOn(t);
    ground.style.opacity = String(fo * 0.94);
    tex.style.opacity = String(fo * 0.6);
    tex.style.transform = `rotate(${t * 0.004}deg) scale(1.6)`;
    flash.style.opacity = String(
      t >= IMPACT ? (1 - eo3(seg(t, IMPACT, IMPACT + 480))) * 0.95 : 0.18 * seg(t, 2200, IMPACT),
    );

    // ---- キャラクターの後ろ ----
    cu.setTransform(dpr, 0, 0, dpr, 0, 0);
    cu.clearRect(0, 0, FW, FH);
    if (fo > 0) {
      for (const c of CLOUDS) {
        const cx = c.x * FW + Math.sin(t * 0.0004 + c.ph) * 10 * k;
        const cy = c.y * FH;
        const r = c.r * k;
        const rg = cu.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, `rgba(255,255,255,${0.5 * fo})`);
        rg.addColorStop(1, "rgba(255,255,255,0)");
        cu.fillStyle = rg;
        cu.beginPath();
        cu.arc(cx, cy, r, 0, Math.PI * 2);
        cu.fill();
      }
      for (const m of DUST) {
        const yy = (((m.y * FH - (t - IMPACT) * m.v * k) % FH) + FH) % FH;
        cu.fillStyle = `rgba(255,250,225,${0.75 * fo * (0.5 + 0.5 * Math.sin(t * 0.004 + m.ph))})`;
        cu.beginPath();
        cu.arc(m.x * FW + Math.sin(t * 0.001 + m.ph) * 6 * k, yy, m.s * k, 0, Math.PI * 2);
        cu.fill();
      }
    }
    // 天から差し込む光
    const beamA = 0.34 * eo3(seg(t, 500, 1300)) * (1 - seg(t, IMPACT, IMPACT + 300));
    if (beamA > 0) {
      cu.save();
      cu.globalCompositeOperation = "lighter";
      [0.1, 0.33, 0.65, 0.9].forEach((fx, i) => {
        const x0 = fx * FW;
        const fl = 0.75 + 0.25 * Math.sin(t * 0.004 + i * 2);
        const lg = cu.createLinearGradient(x0, -20, gx, gy);
        lg.addColorStop(0, `rgba(255,246,215,${beamA * fl})`);
        lg.addColorStop(1, `rgba(255,226,150,${beamA * 0.35 * fl})`);
        cu.fillStyle = lg;
        cu.beginPath();
        cu.moveTo(x0 - 26 * k, -20);
        cu.lineTo(x0 + 26 * k, -20);
        cu.lineTo(gx + 8 * k, gy + 20 * k);
        cu.lineTo(gx - 8 * k, gy + 20 * k);
        cu.closePath();
        cu.fill();
      });
      cu.restore();
    }
    // 光の柱
    const pA = 0.5 * seg(t, 200, 520) * (1 + 0.08 * Math.sin(t * 0.05));
    let pw = lerp(4, 60, eo3(seg(t, 200, 1500))) * k;
    let pFade = 1;
    if (t >= IMPACT) {
      pw = lerp(pw, 180 * k, eo3(seg(t, IMPACT, IMPACT + 400)));
      pFade = 1 - seg(t, IMPACT, IMPACT + 420);
    }
    if (pA * pFade > 0) {
      cu.save();
      cu.globalCompositeOperation = "lighter";
      const lg = cu.createLinearGradient(gx - pw / 2, 0, gx + pw / 2, 0);
      lg.addColorStop(0, "rgba(255,240,200,0)");
      lg.addColorStop(0.5, `rgba(255,250,232,${pA * pFade})`);
      lg.addColorStop(1, "rgba(255,240,200,0)");
      cu.fillStyle = lg;
      cu.fillRect(gx - pw / 2, -10, pw, gy + 50 * k);
      cu.fillStyle = `rgba(255,255,255,${pA * pFade * 0.8})`;
      cu.fillRect(gx - pw * 0.08, -10, pw * 0.16, gy + 50 * k);
      cu.restore();
    }
    // 衝撃の輪
    for (const dl of [0, 110]) {
      const p = seg(t, IMPACT + dl, IMPACT + dl + 650);
      if (p > 0 && p < 1)
        ring(
          cu,
          circ.x,
          circ.y,
          lerp(30, 290, eo3(p)) * k,
          circ.k,
          lerp(10, 1, p) * k,
          `rgba(255,250,235,${(1 - p) * 0.95})`,
        );
    }
    // 円陣
    const flare = t >= IMPACT ? 1 + 1.4 * (1 - seg(t, IMPACT, IMPACT + 600)) : 1;
    const cA = (t < IMPACT ? 1 : lerp(1, 0.8, seg(t, IMPACT + 600, IMPACT + 1200))) * after(t);
    const cS = 1 + 0.1 * eo3(seg(t, IMPACT, IMPACT + 500));
    drawCircle(cu, t, clamp(cA * flare, 0, 1), cS, fo);
    if (flare > 1.05) drawCircle(cu, t, (flare - 1) * 0.5, cS, 0);
    // 後光：背中から開いて回る光の筋と、頭の後ろの輪
    const aR = seg(t, IMPACT, IMPACT + 160) * lerp(1, 0.62, seg(t, IMPACT + 700, IMPACT + 1600)) * after(t);
    if (aR > 0) {
      const cx = gx;
      const cy = gy - 8 * k;
      const L = lerp(60, 320, eo3(seg(t, IMPACT, IMPACT + 750))) * k;
      const rot = t * 0.00016;
      const n = 20;
      const ray: RGB = [255, 214, 110];
      cu.save();
      const rg = cu.createRadialGradient(cx, cy, 0, cx, cy, L);
      rg.addColorStop(0, `rgba(255,255,250,${aR})`);
      rg.addColorStop(0.3, rgba(ray, aR * 0.85));
      rg.addColorStop(1, rgba(ray, 0));
      cu.fillStyle = rg;
      cu.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rot;
        const w = i % 2 ? 0.03 : 0.065;
        cu.moveTo(cx, cy);
        cu.lineTo(cx + Math.cos(a - w) * L, cy + Math.sin(a - w) * L);
        cu.lineTo(cx + Math.cos(a + w) * L, cy + Math.sin(a + w) * L);
        cu.closePath();
      }
      cu.fill();
      const hr = 120 * k;
      const hg = cu.createRadialGradient(cx, cy, 0, cx, cy, hr);
      hg.addColorStop(0, `rgba(255,255,248,${0.7 * aR})`);
      hg.addColorStop(1, "rgba(255,255,248,0)");
      cu.fillStyle = hg;
      cu.beginPath();
      cu.arc(cx, cy, hr, 0, Math.PI * 2);
      cu.fill();
      const nr = 62 * k * eo3(seg(t, IMPACT + 100, IMPACT + 600));
      if (nr > 1) {
        cu.shadowColor = "rgba(255,210,100,.9)";
        cu.shadowBlur = 14 * k;
        cu.strokeStyle = rgba([214, 160, 40], aR);
        cu.lineWidth = 3 * k;
        cu.beginPath();
        cu.arc(cx, gy - 22 * k, nr, 0, Math.PI * 2);
        cu.stroke();
        cu.lineWidth = 1 * k;
        cu.beginPath();
        cu.arc(cx, gy - 22 * k, nr + 7 * k, 0, Math.PI * 2);
        cu.stroke();
      }
      cu.restore();
    }

    // ---- 画面座標の層 ----
    co.setTransform(dpr, 0, 0, dpr, 0, 0);
    co.clearRect(0, 0, f.width, f.height);
    // 溜めの間、円陣から上る光の粒
    if (t < IMPACT + 200) {
      co.save();
      co.shadowColor = "rgba(255,210,100,1)";
      co.shadowBlur = 6;
      for (const m of MOTES) {
        const p = seg(t, m.b, m.b + 1000);
        if (p <= 0 || p >= 1) continue;
        co.fillStyle = `rgba(255,240,190,${Math.sin(Math.PI * p) * 0.95})`;
        co.beginPath();
        co.arc(
          sCirc.x + m.x * sCirc.R,
          sCirc.y + m.y * sCirc.R * sCirc.k - m.up * ks * p,
          m.s * ks,
          0,
          Math.PI * 2,
        );
        co.fill();
      }
      co.restore();
    }
    // 衝撃の火花
    co.lineCap = "round";
    for (const sp of SPARKS) {
      const lt = t - IMPACT - sp.d;
      if (lt <= 0 || lt >= sp.life) continue;
      const pos = (ms: number) => {
        const q = ms / 1000;
        return [
          sCirc.x + Math.cos(sp.a) * sp.v * ks * q,
          sCirc.y + (Math.sin(sp.a) * sp.v * q * 0.4 - sp.up * q + 380 * q * q) * ks,
        ] as const;
      };
      const [x1, y1] = pos(lt);
      const [x0, y0] = pos(Math.max(0, lt - 34));
      co.strokeStyle = `rgba(255,244,210,${1 - lt / sp.life})`;
      co.lineWidth = 2 * ks;
      co.beginPath();
      co.moveTo(x0, y0);
      co.lineTo(x1, y1);
      co.stroke();
    }
    // 授与：光の玉が抜け出して、真ん中で弾けてカードになる
    gifts.forEach((_, i) => {
      if (flying[i]) return;
      const e = EMIT[i] ?? 0;
      const arr = e + TRAVEL;
      const p = seg(t, e, arr);
      if (p > 0 && p < 1) {
        for (let j = 8; j >= 0; j--) {
          const pp = p - j * 0.035;
          if (pp < 0) continue;
          const [x, yy] = orbAt(i, pp);
          const a = j === 0 ? 1 : (1 - j / 9) * 0.5;
          const r = (j === 0 ? 24 : 12 * (1 - j / 10)) * ks;
          const g = co.createRadialGradient(x, yy, 0, x, yy, r);
          g.addColorStop(0, `rgba(255,255,255,${a})`);
          g.addColorStop(0.35, `rgba(255,214,100,${a * 0.9})`);
          g.addColorStop(0.7, `rgba(214,150,30,${a * 0.45})`);
          g.addColorStop(1, "rgba(200,140,30,0)");
          co.fillStyle = g;
          co.beginPath();
          co.arc(x, yy, r, 0, Math.PI * 2);
          co.fill();
          if (j === 0) {
            co.lineWidth = 2;
            co.strokeStyle = "rgba(190,130,20,.9)";
            co.beginPath();
            co.arc(x, yy, 8 * ks, 0, Math.PI * 2);
            co.stroke();
            co.fillStyle = "#fff";
            co.beginPath();
            co.arc(x, yy, 6 * ks, 0, Math.PI * 2);
            co.fill();
          }
        }
      }
      const x = upX[i] ?? sx;
      if (t < arr) {
        placeGift(i, x, upY, 0.25, 0);
        return;
      }
      const q = seg(t, arr, arr + 260);
      const bp = seg(t, arr, arr + 320);
      if (bp < 1)
        ring(co, x, upY, lerp(10, 80, eo3(bp)) * ks, 1, lerp(5, 1, bp), `rgba(255,246,210,${1 - bp})`);
      // 見せる：ゆらぎと光
      const fl = t >= 4150 ? Math.sin((t - 4150) / 280 + i * 1.3) * 2.2 * seg(t, 4150, 4400) : 0;
      placeGift(
        i,
        x,
        upY + fl,
        lerp(0.25, 1, back(q)),
        1,
        lerp(90, 0, eo3(q)),
        lerp(3, 1, seg(t, arr, arr + 380)),
        t >= 4000 ? 0.7 : 0,
      );
      const sheen = gifts[i]?.querySelector<HTMLElement>(".gd-sheen");
      if (sheen)
        sheen.style.transform = `translateX(${lerp(-120, 120, seg(t, 4220 + i * 100, 4670 + i * 100))}%)`;
    });
  };

  // 手札へ：1枚ずつ、手札に加わったカードの場所へ飛ばす
  const revealed: HTMLElement[] = [];
  const flyIn = async (i: number) => {
    const g = gifts[i];
    const el = await o.toHand(i);
    if (!g) return;
    flying[i] = true;
    const from = last[i] ?? { x: sx, y: sy, s: 1 };
    // 行き先は毎回測り直す（あとのカードが加わると、手札が詰め直されて場所がずれるため）
    const target = () => {
      const tr = el?.getBoundingClientRect();
      return tr
        ? { x: tr.left + tr.width / 2 - f.left, y: tr.top + tr.height / 2 - f.top, s: tr.width / GW }
        : { x: f.width / 2, y: f.height * 0.9, s: 0.4 };
    };
    const p = { v: 0 };
    await new Promise<void>((resolve) => {
      gsap.to(p, {
        v: 1,
        duration: FLY / 1000,
        ease: "none",
        onUpdate: () => {
          const q = eio(p.v);
          const to = target();
          const end = mine ? to.s : Math.min(0.2, to.s);
          placeGift(
            i,
            lerp(from.x, to.x, q),
            lerp(from.y, to.y, q) - Math.sin(Math.PI * q) * 30 * ks,
            lerp(from.s, end, q),
            mine ? 1 : 1 - seg(p.v, 0.7, 1),
            0,
            1,
            0.7 * (1 - q),
          );
        },
        onComplete: resolve,
      });
    });
    g.style.opacity = "0";
    if (el) {
      if (mine) el.style.opacity = "";
      revealed.push(el);
      el.animate(
        [
          { filter: "brightness(2)", boxShadow: "0 0 18px 4px rgba(255,214,110,.9)" },
          { filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(255,214,110,0)" },
        ],
        { duration: 380, easing: "ease-out" },
      );
    }
  };

  const clock = { t: 0 };
  const flights: Promise<void>[] = [];
  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to(clock, { t: END, duration: END / 1000, ease: "none", onUpdate: () => render(clock.t) }, 0);
    gifts.forEach((_, i) => {
      tl.call(() => flights.push(flyIn(i)), undefined, (HOLD_END + i * FLY_GAP) / 1000);
    });
  });
  await Promise.all(flights);
  // 後片付け：神のカードと盤面を元に戻す
  // （GSAP の clearProps は、全体の時間を止めているときに効かないことがあるので、style からも消す）
  gsap.set(unit, { clearProps: "transform,opacity,filter,zIndex,boxShadow" });
  for (const p of ["transform", "translate", "rotate", "scale", "opacity", "filter", "z-index", "box-shadow"])
    unit.style.removeProperty(p);
  if (board) {
    gsap.set(board, { clearProps: "transform" });
    for (const p of ["transform", "translate", "rotate", "scale"]) board.style.removeProperty(p);
  }
  for (const el of revealed) el.style.opacity = "";
  ov.remove();
}
