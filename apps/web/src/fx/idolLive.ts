import { gsap } from "gsap";
import { frameRect } from "../frame";
import { playSe } from "../sound/se";

/**
 * ★5のアイドルが場に出たときのライブ演出。ふつうの着地の代わりに見せる（10月25日、オーナーがモックで選んだ案A・叩きつけ）。
 * 1. 暗転（0〜0.35 秒）：盤面が暗くなり、一拍止まる
 * 2. スポットライト（0.56 秒〜）：上から、出た枠へ光が差す
 * 3. 叩きつけ（0.62〜0.94 秒）：白く光ったカードが少し上で溜めて、枠へ叩きつける
 * 4. 一斉点灯（0.94 秒）：着地の瞬間に、手前の客席のペンライトが全部同時にアイドルの色で灯り、そろって左右に揺れる。足もとに輪・小さな揺れ
 * 5. 余韻のあと明るく戻る（2.39〜2.94 秒）
 *
 * ペンライトは手前の客席（画面の下）だけ。4列とも最前列と同じ 15 本・同じ間隔で、列の中の位置はばらばら。
 * 後ろの列ほど人が抜け、最後列（いちばん手前）がいちばんまばら。どのカードでも、関係ない色が 2 本だけ混ざる（実際の現場らしく）。
 * 色はトップアイドルとミレイがピンク、アイリが薄紫、地下アイドルが白（本数は少なめ）。
 *
 * 暗転の上にカードの写しを置いて動かし、本物のカードは終わるまで隠しておく（呼ぶ側で隠す）。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

type RGB = [number, number, number];

/** この演出で場に出るカードと、ペンライトの色・本数（1 がいっぱい） */
export const IDOL_LIVE: Readonly<Record<string, { color: RGB; density: number }>> = {
  m1: { color: [255, 120, 200], density: 1 },
  c13: { color: [255, 120, 200], density: 1 },
  c6: { color: [178, 140, 255], density: 1 },
  m2: { color: [255, 255, 255], density: 0.32 },
};

export interface IdolLiveOpts {
  /** 場に出たアイドル（data-uid の要素。最終の位置に置いて隠してある） */
  unit: HTMLElement;
  /** 画面座標の演出の層 */
  layer: HTMLElement;
  cardId: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eo2 = (x: number) => 1 - (1 - x) * (1 - x);
const eo5 = (x: number) => 1 - (1 - x) ** 5;
const ei2 = (x: number) => x * x;
const ei4 = (x: number) => x ** 4;
const backOut = (x: number, s = 3) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const rgba = (c: RGB, a: number) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a)})`;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 時間（ms）。モックと同じ
const T0 = 620;
const IMPACT = T0 + 320;
const HOLD_END = IMPACT + 1450;
const OUT_END = HOLD_END + 550;
const END = OUT_END + 150;

// モックの盤面（360×660）とカードの幅（62）。画面の大きさに合わせて縮める
const MW = 360;
const MH = 660;
const CARD_W = 62;

interface Light {
  x: number;
  y: number;
  len: number;
  w: number;
  off?: RGB;
}

/** 手前の客席のペンライト（モックの座標） */
function buildLights(density: number): Light[] {
  const r = rng(7);
  const lights: Light[] = [];
  // 後ろの列ほど人が抜けて、最後列（いちばん手前）がいちばんまばら
  const KEEP = [1, 1, 0.85, 0.55];
  for (let k = 0; k < 4; k++) {
    const n = 15;
    const y = 520 + k * 34;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (r() - 0.5) * 0.6) * (MW / n);
      const yy = y + (r() - 0.5) * 10;
      if (r() > density * (KEEP[k] ?? 1)) continue;
      // モックと同じ順で乱数を使う（モックは揺れ方の値を5つ取っていた。並びをそろえるため）
      for (let j = 0; j < 5; j++) r();
      lights.push({ x, y: yy, len: 20 + k * 7, w: 2.2 + k * 0.8 });
    }
  }
  // 関係ない色を 2 本だけ混ぜる（となり合わせにしない）
  const OFF: RGB[] = [
    [90, 200, 255],
    [120, 255, 150],
    [255, 210, 70],
    [255, 140, 60],
  ];
  const a = Math.floor(r() * lights.length);
  let b = Math.floor(r() * lights.length);
  if (Math.abs(b - a) < 4) b = (a + Math.floor(lights.length / 2)) % lights.length;
  const o = Math.floor(r() * OFF.length);
  const la = lights[a];
  const lb = lights[b];
  if (la) la.off = OFF[o];
  if (lb) lb.off = OFF[(o + 2) % OFF.length];
  return lights;
}

function canvasAt(parent: HTMLElement, left: number, top: number, w: number, h: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  Object.assign(c.style, {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  parent.appendChild(c);
  const g = c.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/** カードの動き（叩きつけ）。lift はカードの幅に合わせた倍率 k で直す */
function slam(t: number) {
  const lift = 50;
  const t1 = T0 + 220;
  const t2 = t1 + 100;
  const t3 = t2 + 40;
  const t4 = t3 + 70;
  const t5 = t4 + 350;
  if (t < T0) return { o: 0, y: -lift, sx: 1.2, sy: 1.2, br: 1.8 };
  if (t < t1) {
    const k = eo2(seg(t, T0, t1));
    return { o: k, y: -lift - 8 * k, sx: 1.2 + 0.08 * k, sy: 1.2 + 0.08 * k, br: 1.8 };
  }
  if (t < t2) {
    const k = ei4(seg(t, t1, t2));
    return { o: 1, y: (-lift - 8) * (1 - k), sx: 1.28 - 0.28 * k, sy: 1.28 - 0.28 * k, br: 1.8 };
  }
  if (t < t3) {
    const k = eo2(seg(t, t2, t3));
    return { o: 1, y: 0, sx: 1 + 0.1 * k, sy: 1 - 0.1 * k, br: 1.8 + 0.4 * k };
  }
  if (t < t4) return { o: 1, y: 0, sx: 1.1, sy: 0.9, br: 2.2 };
  const b = backOut(seg(t, t4, t5));
  return { o: 1, y: 0, sx: 1.1 - 0.1 * b, sy: 0.9 + 0.1 * b, br: 2.2 - 1.2 * eo2(seg(t, t4, t4 + 400)) };
}

export async function idolLive(o: IdolLiveOpts): Promise<void> {
  const { unit, layer, cardId } = o;
  const look = IDOL_LIVE[cardId];
  if (!look) return;
  setTimeout(() => playSe("aceEntry"), 940); // 枠へ叩きつける瞬間
  const col = look.color;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const f = frameRect();
  const ur = unit.getBoundingClientRect();
  /** モックの盤面から画面への倍率（横）と、カードの倍率 */
  const sw = f.width / MW;
  const k = ur.width / CARD_W;
  const CX = ur.left + ur.width / 2;
  const FEET = ur.bottom - 4 * k;

  // 層：暗転 → スポットライト → カードの写し → ペンライトと輪
  const root = document.createElement("div");
  Object.assign(root.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  const veil = document.createElement("div");
  Object.assign(veil.style, {
    position: "absolute",
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
    background: "#04030a",
    opacity: "0",
  });
  root.appendChild(veil);
  const gBeam = canvasAt(root, f.left, f.top, f.width, f.height, dpr);
  const card = unit.cloneNode(true) as HTMLElement;
  // 場に出たときの落ちてくる動き（.enter）を写しでやり直さないように外す
  card.classList.remove("enter");
  card.removeAttribute("data-uid");
  Object.assign(card.style, {
    position: "absolute",
    margin: "0",
    left: `${ur.left}px`,
    top: `${ur.top}px`,
    width: `${ur.width}px`,
    height: `${ur.height}px`,
    animation: "none",
    opacity: "0",
    transformOrigin: "50% 100%",
  });
  root.appendChild(card);
  const gFx = canvasAt(root, f.left, f.top, f.width, f.height, dpr);
  layer.appendChild(root);
  const board = document.querySelector<HTMLElement>(".board");
  const boardTransform = board?.style.transform ?? "";
  if (!gBeam || !gFx) {
    root.remove();
    return;
  }

  const lights = buildLights(look.density).map((l) => ({
    x: l.x * sw,
    y: (l.y / MH) * f.height,
    len: l.len * sw,
    w: l.w * sw,
    off: l.off,
  }));

  const drawSpot = (a: number) => {
    const topY = -10;
    const botY = FEET - f.top + 6 * k;
    const cx = CX - f.left;
    const topW = 10 * k;
    const botW = 58 * k;
    const cc = mix([255, 255, 255], col, 0.35);
    const grd = gBeam.createLinearGradient(0, topY, 0, botY);
    grd.addColorStop(0, rgba(cc, 0));
    grd.addColorStop(0.25, rgba(cc, 0.18 * a));
    grd.addColorStop(1, rgba(cc, 0.32 * a));
    gBeam.fillStyle = grd;
    gBeam.beginPath();
    gBeam.moveTo(cx - topW, topY);
    gBeam.lineTo(cx + topW, topY);
    gBeam.lineTo(cx + botW, botY);
    gBeam.lineTo(cx - botW, botY);
    gBeam.closePath();
    gBeam.fill();
    // 足もとの光だまり
    gBeam.save();
    gBeam.translate(cx, botY - 2);
    gBeam.scale(1, 0.26);
    const pool = gBeam.createRadialGradient(0, 0, 0, 0, 0, 70 * k);
    pool.addColorStop(0, rgba(cc, 0.55 * a));
    pool.addColorStop(1, rgba(cc, 0));
    gBeam.fillStyle = pool;
    gBeam.beginPath();
    gBeam.arc(0, 0, 70 * k, 0, Math.PI * 2);
    gBeam.fill();
    gBeam.restore();
  };

  const drawLight = (l: (typeof lights)[number], on: number, white: number, ts: number) => {
    if (on <= 0.01) return;
    // そろって左右に揺れる（0.9 秒で一往復）
    const ang = Math.sin((ts / 0.9) * Math.PI * 2) * 0.38;
    const tx = l.x + Math.sin(ang) * l.len;
    const ty = l.y - Math.cos(ang) * l.len;
    const c = mix(l.off ?? col, [255, 255, 255], white * 0.85);
    const core = mix(c, [255, 255, 255], 0.55);
    gFx.lineCap = "round";
    for (const [color, a, w] of [
      [c, 0.13, 5.5],
      [c, 0.35, 2.4],
      [core, 0.95, 1],
    ] as const) {
      gFx.strokeStyle = rgba(color, a * on);
      gFx.lineWidth = l.w * w;
      gFx.beginPath();
      gFx.moveTo(l.x, l.y);
      gFx.lineTo(tx, ty);
      gFx.stroke();
    }
  };

  const drawRing = (p: number) => {
    gFx.save();
    gFx.translate(CX - f.left, FEET - f.top);
    gFx.scale(1, 0.34);
    const a = 1 - p;
    const r = CARD_W * k * (0.35 + eo5(p));
    gFx.lineWidth = (6 - 5 * p) * k;
    gFx.strokeStyle = rgba(col, a);
    gFx.beginPath();
    gFx.arc(0, 0, r, 0, Math.PI * 2);
    gFx.stroke();
    gFx.lineWidth = (14 - 10 * p) * k;
    gFx.strokeStyle = rgba([255, 255, 255], a * 0.25);
    gFx.beginPath();
    gFx.arc(0, 0, r, 0, Math.PI * 2);
    gFx.stroke();
    gFx.restore();
  };

  const render = (t: number) => {
    const ts = t / 1000;
    const darkIn = eo2(seg(t, 0, 350));
    const darkOut = 1 - ei2(seg(t, HOLD_END, OUT_END));
    const dark = 0.86 * darkIn * darkOut;
    veil.style.opacity = String(dark);
    const flash = t >= IMPACT ? 1 - seg(t, IMPACT, IMPACT + 300) : 0;

    // カード（足もとを軸に、叩きつけて潰れて戻る）
    const c = slam(t);
    const glow =
      dark > 0 && t >= IMPACT
        ? ` drop-shadow(0 0 ${(8 + 10 * flash) * k}px ${rgba(col, 0.55 * (dark / 0.86) + 0.2 * flash)})`
        : "";
    card.style.opacity = String(c.o);
    card.style.transform = `translateY(${c.y * k}px) scale(${c.sx}, ${c.sy})`;
    card.style.filter = `brightness(${c.br.toFixed(3)})${glow}`;

    // 小さな揺れ
    const shake = t >= IMPACT ? (1 - seg(t, IMPACT, IMPACT + 180)) * 0.5 : 0;
    const shakeT =
      shake > 0
        ? `translate(${Math.sin(ts * 90) * 6 * shake * sw}px, ${Math.cos(ts * 117) * 3.6 * shake * sw}px)`
        : "";
    root.style.transform = shakeT;
    if (board) board.style.transform = shakeT || boardTransform;

    // スポットライト（カードより下）
    gBeam.clearRect(0, 0, f.width, f.height);
    gBeam.globalCompositeOperation = "lighter";
    const beam = (t >= T0 - 60 ? eo5(seg(t, T0 - 60, T0)) : 0) * darkOut;
    if (beam > 0) drawSpot(beam);

    // ペンライトと輪（カードより上）
    gFx.clearRect(0, 0, f.width, f.height);
    gFx.globalCompositeOperation = "lighter";
    const on = (t >= IMPACT ? 1 : 0) * darkOut;
    const white = t >= IMPACT ? 1 - seg(t, IMPACT, IMPACT + 140) : 0;
    for (const l of lights) drawLight(l, on, white, ts);
    const ring = t >= IMPACT ? seg(t, IMPACT, IMPACT + 600) : -1;
    if (ring >= 0 && ring < 1) drawRing(ring);
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
  }
}
