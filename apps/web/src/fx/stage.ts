import type { Application, Container, Texture } from "pixi.js";

/**
 * 演出用の舞台：画面いっぱいに重ねた透明な Canvas（PixiJS / WebGL）。
 * - カードや手札は今までどおり React（DOM）で描き、粒・光・衝撃波などの演出だけをここに描く
 * - タップは下の盤面へ素通りさせる（pointer-events: none）
 * - PixiJS は最初に使うときに読み込む（別ファイルに分けて、最初の表示を重くしない）
 * - 演出が動いている間だけ描き、止まっている間は描画を止める（電池を減らさない）
 * 動きの時間軸は GSAP で付ける（fx/*.ts）。座標は getBoundingClientRect の画面座標をそのまま使う。
 */

export type Pixi = typeof import("pixi.js");

export interface FxStage {
  pixi: Pixi;
  app: Application;
  /** 演出をのせる親（画面座標） */
  root: Container;
  tex: {
    /** 中心が白く、外へ透明になる丸い光 */
    glow: Texture;
    /** 4 方向に光が伸びるきらめき */
    spark: Texture;
    /** ふちがやわらかい雲のかたまり（霧・煙） */
    puff: Texture;
  };
  /** 演出を 1 つ始める（描画を動かす）。終わったら返り値の関数を呼ぶ */
  hold: () => () => void;
}

let boot: Promise<FxStage | null> | null = null;

/** 舞台を用意する（2 回目からは同じものを返す）。WebGL が使えない環境では null */
export function fxStage(): Promise<FxStage | null> {
  if (!boot) {
    boot = create().catch((e: unknown) => {
      console.warn("[fx] 演出の舞台を用意できませんでした", e);
      return null;
    });
  }
  return boot;
}

/** 演出を出してよいか（テスト環境・「視差効果を減らす」設定では出さない） */
export function fxEnabled(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return typeof HTMLCanvasElement !== "undefined" && !/jsdom/i.test(navigator.userAgent);
}

async function create(): Promise<FxStage | null> {
  if (!fxEnabled()) return null;
  const pixi = await import("pixi.js");
  const app = new pixi.Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resizeTo: window,
    // スマホの高解像度は 2 倍までに抑える（3 倍で描いても見た目はほぼ変わらず、重くなるだけ）
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: "webgl",
    powerPreference: "high-performance",
  });
  app.canvas.id = "fx-stage";
  app.canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(app.canvas);

  const root = new pixi.Container();
  app.stage.addChild(root);

  // 何も動いていないときは描かない
  app.ticker.stop();
  let active = 0;
  const hold = () => {
    active += 1;
    if (active === 1) app.ticker.start();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active -= 1;
      if (active === 0) {
        app.render();
        app.ticker.stop();
      }
    };
  };

  return {
    pixi,
    app,
    root,
    tex: { glow: glowTexture(pixi), spark: sparkTexture(pixi), puff: puffTexture(pixi) },
    hold,
  };
}

/** 丸い光（白 → 透明）。tint で色を付けて、加算合成で重ねる */
function glowTexture(pixi: Pixi): Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return pixi.Texture.from(c);
}

/** きらめき：細い光の筋を十字に重ね、中心を丸く光らせる */
function sparkTexture(pixi: Pixi): Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const r = size / 2;
    const ray = (w: number, h: number) => {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.save();
      g.translate(r, r);
      g.scale(w, h);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    ray(r, r * 0.09);
    ray(r * 0.09, r);
    ray(r * 0.32, r * 0.32);
  }
  return pixi.Texture.from(c);
}

/** 雲のかたまり：丸い光をいくつかずらして重ね、ふちを不揃いにする（霧・煙の 1 粒） */
function puffTexture(pixi: Pixi): Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const blob = (x: number, y: number, r: number, a: number) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    };
    blob(64, 70, 46, 0.55);
    blob(44, 60, 30, 0.45);
    blob(84, 56, 32, 0.4);
    blob(62, 44, 26, 0.35);
    blob(80, 82, 24, 0.3);
  }
  return pixi.Texture.from(c);
}
