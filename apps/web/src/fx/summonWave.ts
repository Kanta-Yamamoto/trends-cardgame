import type { Attribute } from "@trends/cards";
import { gsap } from "gsap";
import type { Graphics } from "pixi.js";
import { paletteOf } from "./palette";
import { fxEnabled, fxStage } from "./stage";

// 開発中だけ、演出の時間をブラウザから遅くできるようにする（__gsap.globalTimeline.timeScale(0.1) で 10 分の 1 の速さ）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __gsap?: typeof gsap }).__gsap = gsap;
}

/**
 * ★5 のアイコンが場に着いた瞬間の、小さめの波動。
 * 中心がふわっと光り → 属性の色の輪が 2 重に広がり → きらめきが外へ散る（全体で約 0.8 秒）。
 * 大きさはカードの幅に合わせるので、PC・スマホ・縦横どの画面でも同じ見え方になる。
 */
export async function summonWave(el: HTMLElement | null, attributes: readonly Attribute[]): Promise<void> {
  if (!el || !fxEnabled()) return;
  const stage = await fxStage();
  if (!stage || !el.isConnected) return;
  const { pixi, root, tex } = stage;
  const pal = paletteOf(attributes);

  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  const w = r.width;
  /** カード幅 80px を 1 とした大きさ（線の太さ・粒の大きさをそろえる） */
  const k = w / 80;

  const fx = new pixi.Container();
  fx.position.set(r.left + r.width / 2, r.top + r.height / 2);
  root.addChild(fx);
  const release = stage.hold();

  // 中心の光
  const glow = new pixi.Sprite(tex.glow);
  glow.anchor.set(0.5);
  glow.tint = pal.light;
  glow.blendMode = "add";
  glow.alpha = 0;
  const glowScale = (w * 1.9) / tex.glow.width;
  glow.scale.set(glowScale * 0.35);
  fx.addChild(glow);

  // 輪（太さを細くしながら広げるので、毎フレーム描き直す）
  const ring = () => {
    const g = new pixi.Graphics();
    g.blendMode = "add";
    fx.addChild(g);
    return g;
  };
  const drawRing = (g: Graphics, radius: number, width: number, color: number, alpha: number) => {
    g.clear();
    if (alpha <= 0.001) return;
    g.circle(0, 0, radius).stroke({ width, color, alpha });
    // 輪の外側にうっすら光のにじみ
    g.circle(0, 0, radius).stroke({ width: width * 3.2, color, alpha: alpha * 0.18 });
  };
  const outer = ring();
  const inner = ring();

  // きらめき
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const s = new pixi.Sprite(tex.spark);
    s.anchor.set(0.5);
    s.tint = i % 3 === 0 ? pal.sub : i % 3 === 1 ? pal.light : pal.main;
    s.blendMode = "add";
    s.alpha = 0;
    const a = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const d0 = w * 0.62;
    s.position.set(Math.cos(a) * d0, Math.sin(a) * d0);
    s.scale.set(0);
    fx.addChild(s);
    return { s, a };
  });

  // 場に着いたカード自体も一瞬だけ明るくする
  gsap.fromTo(
    el,
    { filter: "brightness(1.35) saturate(1.15)" },
    { filter: "brightness(1) saturate(1)", duration: 0.45, ease: "power2.out", clearProps: "filter" },
  );

  const tl = gsap.timeline();
  tl.to(glow, { alpha: 0.6, duration: 0.08, ease: "power1.out" }, 0)
    .to(glow.scale, { x: glowScale, y: glowScale, duration: 0.42, ease: "expo.out" }, 0)
    .to(glow, { alpha: 0, duration: 0.36, ease: "power2.in" }, 0.1);

  const o = { p: 0 };
  tl.to(
    o,
    {
      p: 1,
      duration: 0.62,
      ease: "expo.out",
      onUpdate: () =>
        drawRing(outer, w * (0.72 + 0.6 * o.p), (3.4 - 2.8 * o.p) * k, pal.main, 1 - o.p ** 1.4),
    },
    0.02,
  );
  const n = { p: 0 };
  tl.to(
    n,
    {
      p: 1,
      duration: 0.56,
      ease: "expo.out",
      onUpdate: () =>
        drawRing(inner, w * (0.64 + 0.4 * n.p), (2.2 - 1.9 * n.p) * k, pal.sub, (1 - n.p) * 0.9),
    },
    0.07,
  );

  for (const { s, a } of sparks) {
    const d = w * (0.98 + Math.random() * 0.4);
    const dur = 0.5 + Math.random() * 0.25;
    const at = 0.04 + Math.random() * 0.08;
    const size = (0.32 + Math.random() * 0.22) * k;
    tl.to(s, { alpha: 1, duration: 0.06 }, at)
      .to(s.scale, { x: size, y: size, duration: 0.12, ease: "back.out(3)" }, at)
      .to(
        s,
        {
          x: Math.cos(a) * d,
          y: Math.sin(a) * d - w * 0.12,
          rotation: (Math.random() - 0.5) * 1.6,
          duration: dur,
          ease: "power3.out",
        },
        at,
      )
      .to(s.scale, { x: 0, y: 0, duration: dur * 0.55, ease: "power2.in" }, at + dur * 0.45)
      .to(s, { alpha: 0, duration: dur * 0.4, ease: "power1.in" }, at + dur * 0.6);
  }

  await tl.then();
  fx.destroy({ children: true });
  release();
}
