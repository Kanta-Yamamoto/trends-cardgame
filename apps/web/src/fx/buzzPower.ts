import { gsap } from "gsap";
import { frameRect } from "../frame";

/**
 * バズの演出（10月23日に決定。モック：claude.ai の Artifact「バズの演出 案」）。
 * 言葉（「バズ」の文字）は出さず、動きで見せる：
 *   1. 画面のまん中に横長の帯が開き、バズったキャラの絵を大きく見せる → 帯が細い線に閉じる
 *   2. 帯から赤い光の筋がアイコンへ飛び込む
 *   3. カードの中だけで、赤い光の筋が下から上へゆっくり3回のぼる
 *   4. 攻撃力・体力の上に「+2」を見せてから、数字を変える（ここで resolve する。呼び手が state を進める）
 * 演出はカードのまわり（外へ 6px まで）だけ。広く散る紙吹雪・数字のまわりを回る輪は付けない（オーナーの指示）。
 */

/** 光の筋の色（赤一色） */
const RED = "#ff2a3d";
/** 光の筋：1回ののぼる時間（秒）・くり返す間隔（秒）・くり返す回数 */
const RAY = 0.65;
const GAP = 0.35;
const WAVES = 3;
/** カードの外にはみ出してよい幅（px） */
const SPILL = 6;

const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 画面座標の四角に合わせて、演出の層に置くキャンバス */
function canvasAt(layer: HTMLElement, r: { left: number; top: number; width: number; height: number }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement("canvas");
  cv.className = "fx-canvas";
  Object.assign(cv.style, {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  layer.appendChild(cv);
  const g = cv.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, g };
}

/** 1. キャラの絵を見せる帯（0.86 秒） */
async function showArt(layer: HTMLElement, art: string | undefined) {
  const f = frameRect();
  const h = Math.min(168, f.height * 0.24);
  const dim = document.createElement("div");
  dim.className = "fx-buzz-dim";
  Object.assign(dim.style, {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  const strip = document.createElement("div");
  strip.className = "fx-buzz-strip";
  Object.assign(strip.style, {
    left: `${f.left}px`,
    top: `${f.top + f.height / 2 - h / 2}px`,
    width: `${f.width}px`,
    height: `${h}px`,
  });
  if (art) {
    const img = document.createElement("img");
    img.src = art;
    img.alt = "";
    strip.appendChild(img);
    img.animate([{ transform: "translateY(-4%) scale(1.2)" }, { transform: "translateY(4%) scale(1.32)" }], {
      duration: 950,
      easing: "linear",
      fill: "forwards",
    });
  }
  layer.append(dim, strip);
  dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" });
  strip.animate([{ clipPath: "inset(50% 0 50% 0)" }, { clipPath: "inset(0 0 0 0)" }], {
    duration: 250,
    easing: "cubic-bezier(.16,1,.3,1)",
    fill: "forwards",
  });
  await wait(0.7);
  strip.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(50% 0 50% 0)" }], {
    duration: 160,
    easing: "cubic-bezier(.7,0,.84,0)",
    fill: "forwards",
  });
  dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: "forwards" }).onfinish = () =>
    dim.remove();
  await wait(0.16);
  strip.remove();
  return { x: f.left + f.width / 2, y: f.top + f.height / 2 };
}

/** 2. 帯からアイコンへ、赤い光の筋が飛び込む（加速して 0.2 秒） */
async function beamTo(layer: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  const f = frameRect();
  const { cv, g } = canvasAt(layer, f);
  if (!g) return cv.remove();
  const a = { x: from.x - f.left, y: from.y - f.top };
  const b = { x: to.x - f.left, y: to.y - f.top };
  const c = { x: (a.x + b.x) / 2 - 40, y: Math.min(a.y, b.y) - 30 };
  const trail: { x: number; y: number }[] = [];
  const st = { k: 0, alpha: 1 };
  const draw = () => {
    const e = st.k * st.k;
    trail.push({
      x: (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * c.x + e * e * b.x,
      y: (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * c.y + e * e * b.y,
    });
    if (trail.length > 14) trail.shift();
    g.clearRect(0, 0, f.width, f.height);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const [w, col, al] of [
      [10, RED, 0.35],
      [5, RED, 0.75],
      [2, "#ffffff", 1],
    ] as const) {
      g.globalAlpha = al * st.alpha;
      g.strokeStyle = col;
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1] as { x: number; y: number };
        const p1 = trail[i] as { x: number; y: number };
        g.lineWidth = w * (i / trail.length);
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
        g.stroke();
      }
    }
  };
  await gsap.to(st, { k: 1, duration: 0.2, ease: "none", onUpdate: draw });
  gsap.to(st, { alpha: 0, duration: 0.2, onUpdate: draw, onComplete: () => cv.remove() });
}

/** 3. カードの中だけで、赤い光の筋が下から上へ 3 回のぼる（太い筋 2 本と細い筋 5 本。先が明るく、尾は消える） */
function rays(layer: HTMLElement, card: DOMRect): Promise<void> {
  const box = {
    left: card.left - SPILL,
    top: card.top - SPILL,
    width: card.width + SPILL * 2,
    height: card.height + SPILL * 2,
  };
  const { cv, g } = canvasAt(layer, box);
  if (!g) {
    cv.remove();
    return Promise.resolve();
  }
  const w = card.width;
  const h = card.height;
  type Ray = { x: number; at: number; len: number; s: number; glow: number };
  const list: Ray[] = [];
  for (let wave = 0; wave < WAVES; wave++) {
    const base = wave * GAP;
    for (let i = 0; i < 5; i++) {
      list.push({
        x: SPILL + w * ((i + 0.5) / 5) + (Math.random() - 0.5) * 4,
        at: base + i * 0.04 + Math.random() * 0.024,
        len: h * (0.45 + Math.random() * 0.2),
        s: 1,
        glow: 3,
      });
    }
    for (let i = 0; i < 2; i++) {
      list.push({
        x: SPILL + w * (i === 0 ? 0.3 : 0.68) + (Math.random() - 0.5) * 6,
        at: base + 0.05 + i * 0.09,
        len: h * (0.5 + Math.random() * 0.15),
        s: 3.2,
        glow: 10,
      });
    }
  }
  const clock = { t: 0 };
  const total = (WAVES - 1) * GAP + 0.17 + RAY;
  const bottom = SPILL + h;
  const draw = () => {
    g.clearRect(0, 0, box.width, box.height);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const r of list) {
      const k = (clock.t - r.at) / RAY;
      if (k <= 0 || k >= 1) continue;
      const fade = Math.min(1, k * 6) * (1 - k * k);
      const y = bottom + r.len * 0.2 - (h + r.len) * k;
      for (const [lw, al] of [
        [r.glow, 0.35],
        [r.s, 1],
      ] as const) {
        const grad = g.createLinearGradient(0, y, 0, y + r.len);
        grad.addColorStop(0, RED);
        grad.addColorStop(1, `${RED}00`);
        g.strokeStyle = grad;
        g.globalAlpha = fade * al;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(r.x, y);
        g.lineTo(r.x, y + r.len);
        g.stroke();
      }
    }
  };
  return new Promise((resolve) => {
    gsap.to(clock, {
      t: total,
      duration: total,
      ease: "none",
      onUpdate: draw,
      onComplete: () => {
        cv.remove();
        resolve();
      },
    });
  });
}

/** 4. 攻撃力・体力の上に「+N」を浮かべる。返り値は、数字が変わったあとに消す関数 */
function showPlus(layer: HTMLElement, el: HTMLElement, attack: number, hp: number) {
  const tags: HTMLElement[] = [];
  for (const [sel, n, kind] of [
    [".mini-atk", attack, "atk"],
    [".mini-hp", hp, "hp"],
  ] as const) {
    const s = el.querySelector<HTMLElement>(sel);
    if (!s || n <= 0) continue;
    const r = s.getBoundingClientRect();
    const tag = document.createElement("b");
    tag.className = `fx-plus ${kind}`;
    tag.textContent = `+${n}`;
    Object.assign(tag.style, { left: `${r.left + r.width / 2}px`, top: `${r.top - 3}px` });
    layer.appendChild(tag);
    tag.animate(
      [
        { opacity: 0, transform: "translate(-50%, -100%) translateY(6px) scale(0.7)" },
        { opacity: 1, transform: "translate(-50%, -100%) translateY(0) scale(1)" },
      ],
      { duration: 200, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" },
    );
    tags.push(tag);
  }
  return () => {
    for (const tag of tags) {
      tag.animate(
        [
          { opacity: 1, transform: "translate(-50%, -100%) translateY(0)" },
          { opacity: 0, transform: "translate(-50%, -100%) translateY(-8px)" },
        ],
        { duration: 260, delay: 120, easing: "ease-in", fill: "forwards" },
      ).onfinish = () => tag.remove();
    }
  };
}

/**
 * バズの演出。数字を変える瞬間に resolve する（呼び手はそこで state を進める）。
 * 光の筋と「+2」の後片付けは、resolve のあとも続けて行う。
 */
export async function buzzPower(
  layer: HTMLElement,
  el: HTMLElement | null,
  opts: { art?: string; attack: number; hp: number },
): Promise<void> {
  if (!el || reduced() || typeof Element.prototype.animate !== "function") return;
  const from = await showArt(layer, opts.art);
  if (!el.isConnected) return;
  const r = el.getBoundingClientRect();
  await beamTo(layer, from, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  el.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 260 });
  await wait(0.06);
  void rays(layer, el.getBoundingClientRect());
  await wait(GAP);
  const hide = showPlus(layer, el, opts.attack, opts.hp);
  await wait(0.4);
  hide();
}
