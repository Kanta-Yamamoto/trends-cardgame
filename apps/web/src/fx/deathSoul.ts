import { gsap } from "gsap";

/**
 * 【破壊されたとき】の魂（10月29日。オーナーとモックで詰めて決めた。「B 光の粒」「白 × 淡いミント」）。
 * 1. 破壊されたキャラクターは、いつもの消え方をせずに、色が抜けて白く薄い抜け殻になってその枠に残る（shellUnit）
 * 2. 抜け殻の下のドクロの印が光ってふくらみ、抜け殻から光の粒が立ちのぼって、上で 1 つの魂にまとまる（riseSoul）
 * 3. 魂が一瞬縮んで溜め、尾を引いて効果の先へ飛ぶ（soulFly）。当たったら、いつもの当たり方（ダメージの数字など）
 * 4. 抜け殻は、当たったあとに、いつもの消え方で墓地へ（呼ぶ側が toTrash する）
 * 闇堕ちの紫・黒とぶつからないよう、魂は白に寄せる。文字の札は出さない（言葉ではなく動きで見せる）
 */

type Point = { x: number; y: number };

/** 魂の色。中心は白、まわりは淡いミント */
export const SOUL = { mid: "#d6fff0", glow: "#8ceccc", rgb: "140,236,204" };

const wait = (ms: number) => new Promise<void>((r) => gsap.delayedCall(ms / 1000, r));
const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const inOutC = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
/** 粒ごとに決まった乱数（毎回同じ散らばり方） */
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 抜け殻の見た目。墓地へ送るときの消え方（fx/dissolve.ts）も、ここから黒く沈める */
export const SHELL_FILTER = { grayscale: 1, contrast: 0.5, brightness: 2.1, opacity: 0.62 };

/** 色が抜けて、白く薄い抜け殻になる（0.24 秒）。抜け殻の印（data-shell）を付ける */
export function shellUnit(el: HTMLElement) {
  const f = SHELL_FILTER;
  el.dataset.shell = "1";
  el.animate(
    [
      { filter: "grayscale(0) contrast(1) brightness(1)", opacity: 1 },
      {
        filter: `grayscale(${f.grayscale}) contrast(${f.contrast}) brightness(${f.brightness})`,
        opacity: f.opacity,
      },
    ],
    { duration: 240, easing: "cubic-bezier(.3,.6,.4,1)" },
  );
  // 墓地へ送るときの抜け殻（複製）にも同じ見た目が写るよう、終わりの姿は style に書く
  el.style.filter = `grayscale(${f.grayscale}) contrast(${f.contrast}) brightness(${f.brightness})`;
  el.style.opacity = String(f.opacity);
}

function dot(layer: HTMLElement, cls: string, at: Point, size: number) {
  const n = document.createElement("div");
  n.className = cls;
  Object.assign(n.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${size}px`, height: `${size}px` });
  layer.appendChild(n);
  return n;
}

/**
 * 抜け殻のドクロの印が光り、抜け殻から光の粒が立ちのぼって、上で 1 つの魂にまとまる。
 * 溜め（一瞬縮む）まで見せて、魂のいる点を返す（このあと soulFly で飛ばす）。約 0.38 秒
 */
export async function riseSoul(
  layer: HTMLElement,
  el: HTMLElement | null,
  fallback: Point | null,
): Promise<Point | null> {
  const r = el?.getBoundingClientRect();
  const box = r && r.width > 0 ? r : null;
  const c = box ? center(box) : fallback;
  if (!c) return null;
  const w = box?.width ?? 62;
  const h = box?.height ?? 84;
  const k = w / 62;
  const at = { x: c.x, y: c.y - h * 0.62 };
  if (el) shellUnit(el);

  // ドクロの印：白 × ミントに光ってふくらむ
  const skull = el?.querySelector<HTMLElement>(".mini-skull");
  skull?.animate(
    [
      {
        transform: "scale(1)",
        boxShadow: `0 0 0 1.5px #ffffffc8, 0 0 0 0 rgba(${SOUL.rgb},0)`,
        color: "#f4fffb",
      },
      {
        transform: "scale(1.6)",
        boxShadow: `0 0 0 1.5px ${SOUL.mid}, 0 0 ${14 * k}px ${4 * k}px rgba(${SOUL.rgb},.9)`,
        color: "#ffffff",
        offset: 0.4,
      },
      {
        transform: "scale(1.15)",
        boxShadow: `0 0 0 1.5px ${SOUL.mid}, 0 0 ${12 * k}px ${3 * k}px rgba(${SOUL.rgb},.7)`,
        color: "#ffffff",
      },
    ],
    { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
  );

  // 光の粒：抜け殻のあちこちから、渦を巻いて魂の点へ集まる
  const motes = 24;
  for (let i = 0; i < motes; i++) {
    const sx = (box ? box.left : c.x - w / 2) + rnd(i, 1) * w;
    const sy = (box ? box.top : c.y - h / 2) + h * 0.2 + rnd(i, 2) * h * 0.75;
    const dir = rnd(i, 3) > 0.5 ? 1 : -1;
    const delay = 20 + i * 9;
    const dur = 270 + rnd(i, 4) * 30 - i * 9;
    const n = dot(layer, "fx-mote", { x: 0, y: 0 }, 11 * k);
    const frames: Keyframe[] = [];
    for (let s = 0; s <= 8; s++) {
      const u = inOutC(s / 8);
      const ang = (1 - u) * 2.4 * dir;
      const ox = (sx - at.x) * (1 - u);
      const oy = (sy - at.y) * (1 - u);
      const x = at.x + ox * Math.cos(ang) - oy * Math.sin(ang);
      const y = at.y + ox * Math.sin(ang) + oy * Math.cos(ang);
      frames.push({
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        opacity: s === 0 ? 0 : s === 8 ? 0.4 : 1,
        offset: s / 8,
      });
    }
    n.animate(frames, { duration: Math.max(120, dur), delay, easing: "linear", fill: "both" }).finished.then(
      () => n.remove(),
      () => n.remove(),
    );
  }

  // 魂：粒が集まるところで生まれ、溜めで一瞬縮む
  const orb = dot(layer, "fx-soul", at, 36 * k);
  orb.animate(
    [
      { transform: "translate(-50%,-50%) scale(0.2)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.55 },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.78 },
      { transform: "translate(-50%,-50%) scale(0.82)", opacity: 1 },
    ],
    { duration: 380 - 200, delay: 200, easing: "cubic-bezier(.3,.6,.4,1)", fill: "both" },
  );
  await wait(380);
  orb.remove();
  return at;
}

/** 魂が尾を引いて飛ぶ（少し横へ弧を描く。0.38 秒）。当たったら resolve する */
export async function soulFly(layer: HTMLElement, from: Point, to: Point, size = 36): Promise<void> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(38 * (size / 36), len * 0.3);
  const ctrl = { x: (from.x + to.x) / 2 - (dy / len) * bend, y: (from.y + to.y) / 2 + (dx / len) * bend };
  const path: Keyframe[] = [];
  for (let s = 0; s <= 10; s++) {
    const u = inOutC(s / 10);
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    const x = a * from.x + b * ctrl.x + c * to.x;
    const y = a * from.y + b * ctrl.y + c * to.y;
    path.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`, offset: s / 10 });
  }
  const duration = 380;
  // 尾：同じ道を少しずつ遅れて、小さく薄くついてくる
  const tail = 8;
  for (let t = tail; t >= 1; t--) {
    const f = 1 - t / (tail + 1);
    const n = dot(layer, "fx-soul", { x: 0, y: 0 }, size * (0.3 + 0.6 * f));
    n.style.opacity = String(0.45 * f);
    n.animate(path, { duration, delay: t * 13, easing: "linear", fill: "both" }).finished.then(
      () => n.remove(),
      () => n.remove(),
    );
  }
  const orb = dot(layer, "fx-soul", { x: 0, y: 0 }, size * 0.82);
  await orb.animate(path, { duration, easing: "linear", fill: "both" }).finished.catch(() => {});
  orb.remove();
}

/** 抜け殻の大きさから、魂の大きさを決める */
export function soulSize(el: HTMLElement | null): number {
  const w = el?.getBoundingClientRect().width ?? 62;
  return 36 * (w > 0 ? w / 62 : 1);
}
