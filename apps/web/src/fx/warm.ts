import { dissolveFilter } from "./dissolve";
import { type FxStage, fxEnabled, fxStage } from "./stage";

/**
 * 演出の舞台（PixiJS）を、手が空いたときに用意して温めておく。止める関数を返す（画面を抜けたら呼ぶ）。
 *
 * 10月23日の軽量化。前は対戦画面を開いた瞬間に舞台を用意していて、対戦開始の VS の演出の最中に
 * WebGL の準備で画面が 0.3〜0.5 秒止まっていた。また、演出の描き方（シェーダー）は最初に使うときに組み立てるので、
 * 最初の攻撃・最初の破壊でも一瞬止まっていた。
 * ここでは手が空いたときに舞台を用意し、演出で使う描き方を、画面に出ない小さな板に 1 度だけ描いて組み立てておく（見た目は変わらない）。
 */
export function warmFx(delayMs = 0): () => void {
  if (!fxEnabled()) return () => {};
  let stopped = false;
  let idle = 0;
  const timer = window.setTimeout(() => {
    const go = () => {
      if (stopped) return;
      void fxStage().then((s) => {
        if (s && !stopped) warm(s);
      });
    };
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(go, { timeout: 1500 });
    else go();
  }, delayMs);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (idle) window.cancelIdleCallback?.(idle);
  };
}

const warmed = new WeakSet<FxStage>();

/** 演出で使う描き方（光の粒の加算・ふつうの重ね・図形・溶ける模様）を、見えない小さな板に 1 度描いて組み立てる */
function warm(stage: FxStage) {
  if (warmed.has(stage)) return;
  warmed.add(stage);
  const { pixi, app, tex } = stage;
  const scene = new pixi.Container();
  const glow = new pixi.Sprite(tex.glow);
  glow.blendMode = "add";
  glow.width = glow.height = 8;
  const puff = new pixi.Sprite(tex.puff);
  puff.width = puff.height = 8;
  const shape = new pixi.Graphics();
  shape.poly([0, 0, 8, 0, 4, 8]).fill({ color: 0xffffff, alpha: 0.5 });
  shape.circle(4, 4, 3).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
  const slab = new pixi.Sprite(pixi.Texture.WHITE);
  slab.width = slab.height = 8;
  const filter = dissolveFilter(pixi);
  slab.filters = [filter];
  scene.addChild(glow, puff, shape, slab);
  const target = pixi.RenderTexture.create({ width: 8, height: 8 });
  try {
    app.renderer.render({ container: scene, target });
  } catch (e) {
    console.warn("[fx] 演出の下準備に失敗しました（演出は最初に使うときに準備されます）", e);
  } finally {
    scene.destroy({ children: true });
    filter.destroy();
    target.destroy(true);
  }
}
