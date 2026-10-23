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
  /**
   * 舞台を一時的に、画面全体を覆う演出（闇堕ちなど）より手前に出す。返り値の関数で元に戻す。
   * ふだんは盤面の上・拡大表示の下にいる
   */
  raise: (zIndex: number) => () => void;
}

let boot: Promise<FxStage | null> | null = null;
/** 用意に失敗した時刻（続けて失敗しないよう、少し間をあけて作り直す） */
let failedAt = 0;
const RETRY_MS = 2000;

/**
 * 舞台を用意する（2 回目からは同じものを返す）。WebGL が使えない環境では null。
 *
 * 一度失敗しても、その結果を覚えたままにはしない（10月23日の不具合）。前は失敗すると null を覚え続け、
 * 衝撃・オワコンの消え方・着地の光など PixiJS の演出が、ページを読み直すまで二度と出なくなっていた。失敗のきっかけ：
 * - 開いている画面の裏で本番を入れ替えると、古い画面が読みに行く PixiJS のファイルがサーバーから消えている
 * - スマホで WebGL が OS に止められる（裏に回した・メモリが足りない）
 * そこで、失敗したら少し間をあけて作り直す。WebGL が止められたら、舞台を捨てて次の演出で作り直す。
 * キャンバスが画面から外れていたら（画面の枠を作り直したなど）、作り直す
 */
export function fxStage(): Promise<FxStage | null> {
  if (boot) {
    const cur = boot;
    return cur.then((s) => {
      // キャンバスが画面から外れていたら作り直す
      if (s && !s.app.canvas.isConnected) {
        if (boot === cur) boot = null;
        discard(s);
        return fxStage();
      }
      return s;
    });
  }
  if (failedAt && performance.now() - failedAt < RETRY_MS) return Promise.resolve(null);
  const p: Promise<FxStage | null> = create()
    .then((s) => {
      // 演出を出さない環境（テスト・動きを減らす設定）では、次に呼ばれたときにまた確かめる
      if (!s && boot === p) boot = null;
      return s;
    })
    .catch((e: unknown) => {
      console.warn("[fx] 演出の舞台を用意できませんでした。少しあとで作り直します", e);
      if (boot === p) boot = null;
      failedAt = performance.now();
      return null;
    });
  boot = p;
  return p;
}

/** 今の舞台を捨てる（次に fxStage() を呼んだときに作り直す） */
function discard(stage: FxStage) {
  try {
    stage.app.ticker.stop();
    stage.app.canvas.remove();
    stage.app.destroy(true, { children: true, texture: true });
  } catch {
    // 壊れた舞台は片付けに失敗してもよい
  }
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
  // body の直下に、画面いっぱいに置く（広い画面では、枠の外を CSS で切る。frame.ts）
  document.body.appendChild(app.canvas);
  // WebGL が止められたら、この舞台は捨てて、次の演出で作り直す
  app.canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      console.warn("[fx] WebGL が止められました。次の演出で舞台を作り直します");
      const mine = boot;
      boot = null;
      void mine?.then((s) => s && discard(s));
    },
    { once: true },
  );

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

  let raised = 0;
  const raise = (zIndex: number) => {
    raised += 1;
    app.canvas.style.zIndex = String(zIndex);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      raised -= 1;
      if (raised === 0) app.canvas.style.zIndex = "";
    };
  };

  return {
    pixi,
    app,
    root,
    raise,
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
