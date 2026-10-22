import { gsap } from "gsap";
import { fxEnabled, fxStage } from "./stage";

type Rect = { left: number; top: number; width: number; height: number };

/** 絵を読み込む（同じオリジンの絵なので、色を読み取れる） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const DUST = { r: 0x0b, g: 0x04, b: 0x10 };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 絵が砂になって消える：四角を細かいマス目に分け、左から右へ順に、そのマスの色の粒がはがれていく。
 * 粒はすぐに黒くなり、風に流されるように右上へ漂いながら小さくなって消える。
 * 画面側は同じ sweep 秒で、元の絵を左から右へ消していく（.dc-from の --cut）。
 * 粒は 2000 個までにして、1 つの更新関数でまとめて動かす（粒ごとに tween を作らない）
 */
export async function disintegrate(
  r: Rect,
  src: string | undefined,
  opts: { zIndex: number; sweep: number },
): Promise<void> {
  if (!fxEnabled()) return;
  const stage = await fxStage();
  if (!stage) return;
  const img = src ? await loadImage(src).catch(() => null) : null;
  const { pixi, root, app } = stage;
  const cols = Math.max(12, Math.floor(Math.sqrt((2000 * r.width) / r.height)));
  const cell = r.width / cols;
  const rows = Math.max(1, Math.round(r.height / cell));
  // 絵をマス目の大きさに縮めて、マスごとの色を読む（background-position: center 20% / cover と同じ切り抜き）
  let px: Uint8ClampedArray | null = null;
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (img && g) {
    const k = Math.max(cols / img.width, rows / img.height);
    const w = img.width * k;
    const h = img.height * k;
    g.drawImage(img, (cols - w) / 2, (rows - h) * 0.2, w, h);
    try {
      px = g.getImageData(0, 0, cols, rows).data;
    } catch {
      px = null;
    }
  }
  const lower = stage.raise(opts.zIndex);
  const release = stage.hold();
  const fx = new pixi.Container();
  root.addChild(fx);
  const k = r.width / 240;
  type Grain = {
    s: import("pixi.js").Sprite;
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    delay: number;
    dur: number;
    size: number;
    cr: number;
    cg: number;
    cb: number;
    wob: number;
  };
  const grains: Grain[] = [];
  let end = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const a = px ? (px[i + 3] ?? 255) : 255;
      if (a < 40) continue;
      const s = new pixi.Sprite(pixi.Texture.WHITE);
      s.anchor.set(0.5);
      s.alpha = 0;
      const size = cell * (0.45 + Math.random() * 0.4);
      s.width = s.height = size;
      fx.addChild(s);
      const delay = (x / cols) * opts.sweep + Math.random() * 0.12;
      const dur = 0.7 + Math.random() * 0.6;
      end = Math.max(end, delay + dur);
      grains.push({
        s,
        x0: r.left + (x + 0.5) * cell,
        y0: r.top + (y + 0.5) * cell,
        vx: (90 + Math.random() * 190) * k,
        vy: -(40 + Math.random() * 150) * k,
        delay,
        dur,
        size,
        cr: px ? (px[i] ?? 40) : 40,
        cg: px ? (px[i + 1] ?? 20) : 20,
        cb: px ? (px[i + 2] ?? 60) : 60,
        wob: Math.random() * Math.PI * 2,
      });
    }
  }
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      for (const p of grains) {
        const lt = (t - p.delay) / p.dur;
        if (lt <= 0) continue;
        const u = clamp01(lt);
        const tau = u * p.dur;
        // 風に流される：右へ加速しながら、少し上へ。ゆらぎを足して砂らしく
        p.s.x = p.x0 + p.vx * tau + 140 * k * tau * tau + Math.sin(p.wob + tau * 7) * 3 * k;
        p.s.y = p.y0 + p.vy * tau - 20 * k * tau * tau;
        // 元の色 → はがれた瞬間に黒い砂へ
        const m = clamp01(u * 8);
        const cr = Math.round(p.cr + (DUST.r - p.cr) * m);
        const cg = Math.round(p.cg + (DUST.g - p.cg) * m);
        const cb = Math.round(p.cb + (DUST.b - p.cb) * m);
        p.s.tint = (cr << 16) | (cg << 8) | cb;
        p.s.alpha = u >= 1 ? 0 : 1 - clamp01((u - 0.25) / 0.75);
        const sz = p.size * (1 - u * 0.6);
        p.s.width = p.s.height = sz;
      }
      if (t >= end) {
        app.ticker.remove(tick);
        resolve();
      }
    };
    app.ticker.add(tick);
  });
  fx.destroy({ children: true });
  release();
  lower();
}

/** 闇の残り火：画面の下から紫の火の粉がゆっくり昇る（余韻） */
export async function embers(seconds: number, zIndex: number): Promise<void> {
  if (!fxEnabled()) return;
  const stage = await fxStage();
  if (!stage) return;
  const { pixi, root, tex } = stage;
  const lower = stage.raise(zIndex);
  const release = stage.hold();
  const fx = new pixi.Container();
  root.addChild(fx);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const tl = gsap.timeline();
  const n = Math.round(Math.min(60, w / 8));
  for (let i = 0; i < n; i++) {
    const s = new pixi.Sprite(tex.glow);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 3 === 0 ? 0xf0d8ff : 0x9a4dff;
    s.alpha = 0;
    const size = (3 + Math.random() * 6) / 32;
    s.scale.set(size);
    s.position.set(Math.random() * w, h * (0.75 + Math.random() * 0.35));
    fx.addChild(s);
    const at = Math.random() * seconds * 0.5;
    const dur = seconds * (0.5 + Math.random() * 0.5);
    tl.to(s, { alpha: 0.9, duration: 0.2 }, at)
      .to(
        s,
        {
          y: s.y - h * (0.4 + Math.random() * 0.5),
          x: s.x + (Math.random() - 0.5) * 80,
          duration: dur,
          ease: "sine.out",
        },
        at,
      )
      .to(s, { alpha: 0, duration: dur * 0.4 }, at + dur * 0.6);
  }
  await tl.then();
  fx.destroy({ children: true });
  release();
  lower();
}
