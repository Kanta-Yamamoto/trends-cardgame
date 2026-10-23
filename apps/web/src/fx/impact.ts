import type { Attribute } from "@trends/cards";
import { gsap } from "gsap";
import { paletteOf } from "./palette";
import { fxEnabled, fxStage } from "./stage";

type Point = { x: number; y: number };

/**
 * 攻撃がぶつかった瞬間の衝撃（攻撃した側の属性の色）。
 * ぶつかった点で白く弾け → 尖った衝撃の形がはじけ → 衝撃の輪が広がり → 火花が当たった向きに飛び散る（約 0.45 秒）。
 * @param at   ぶつかった点（画面座標）
 * @param from 攻撃してきた側の中心（火花を飛ばす向きを決める）
 * @param size 大きさの基準（攻撃したカードの幅）
 * @param power 1 が普通。プレイヤーへの攻撃・大きなダメージは大きく
 */
export async function impact(
  at: Point,
  from: Point,
  attributes: readonly Attribute[],
  size: number,
  power = 1,
): Promise<void> {
  if (!fxEnabled()) return;
  const stage = await fxStage();
  if (!stage) return;
  const { pixi, root, tex } = stage;
  const pal = paletteOf(attributes);
  const w = size * (0.85 + 0.25 * power);
  const k = size / 80;
  /** 攻撃が進んできた向き（火花はこの向きを中心に前へ飛ぶ） */
  const dir = Math.atan2(at.y - from.y, at.x - from.x);

  const fx = new pixi.Container();
  fx.position.set(at.x, at.y);
  root.addChild(fx);
  const release = stage.hold();
  const tl = gsap.timeline();

  // 1. 白く弾ける中心
  const core = new pixi.Sprite(tex.glow);
  core.anchor.set(0.5);
  core.tint = pal.light;
  core.blendMode = "add";
  const coreScale = (w * 1.5) / tex.glow.width;
  core.scale.set(coreScale * 0.3);
  fx.addChild(core);
  const halo = new pixi.Sprite(tex.glow);
  halo.anchor.set(0.5);
  halo.tint = pal.main;
  halo.blendMode = "add";
  halo.alpha = 0.9;
  halo.scale.set(coreScale * 0.5);
  fx.addChild(halo);
  tl.to(core.scale, { x: coreScale, y: coreScale, duration: 0.09, ease: "power2.out" }, 0)
    .to(core, { alpha: 0, duration: 0.22, ease: "power2.in" }, 0.06)
    .to(halo.scale, { x: coreScale * 1.6, y: coreScale * 1.6, duration: 0.3, ease: "expo.out" }, 0)
    .to(halo, { alpha: 0, duration: 0.3, ease: "power1.in" }, 0.04);

  // 2. 尖った衝撃の形（マンガの「ドン」の形）。一瞬だけ大きく出て消える
  const star = new pixi.Graphics();
  const spikes = 9;
  const pts: number[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = dir + Math.PI / 2 + (i / (spikes * 2)) * Math.PI * 2;
    const len = i % 2 === 0 ? w * (0.42 + Math.random() * 0.22) : w * 0.16;
    pts.push(Math.cos(a) * len, Math.sin(a) * len);
  }
  star.poly(pts).fill({ color: pal.light, alpha: 0.95 });
  star.poly(pts.map((v) => v * 0.55)).fill({ color: 0xffffff, alpha: 1 });
  star.blendMode = "add";
  star.scale.set(0.35);
  star.rotation = (Math.random() - 0.5) * 0.4;
  fx.addChild(star);
  tl.to(star.scale, { x: 1, y: 1, duration: 0.07, ease: "power3.out" }, 0)
    .to(star.scale, { x: 1.15, y: 1.15, duration: 0.12 }, 0.07)
    .to(star, { alpha: 0, duration: 0.12, ease: "power1.in" }, 0.08);

  // 3. 衝撃の輪
  const ring = new pixi.Graphics();
  ring.blendMode = "add";
  fx.addChild(ring);
  const o = { p: 0 };
  tl.to(
    o,
    {
      p: 1,
      duration: 0.36,
      ease: "expo.out",
      onUpdate: () => {
        const a = 1 - o.p;
        ring.clear();
        if (a <= 0.01) return;
        ring
          .circle(0, 0, w * (0.25 + 0.85 * o.p))
          .stroke({ width: (5 - 4.2 * o.p) * k, color: pal.main, alpha: a });
      },
    },
    0.02,
  );

  // 4. 火花：当たった向きを中心に、前と横へ飛び散る細い光
  const n = Math.round(14 * Math.min(1.6, power));
  for (let i = 0; i < n; i++) {
    const s = new pixi.Sprite(tex.spark);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 3 === 0 ? pal.light : i % 3 === 1 ? pal.main : pal.sub;
    // 前方 ±80° に多め、残りは全方向
    const spread = i < n * 0.7 ? (Math.random() - 0.5) * 2.8 : Math.random() * Math.PI * 2;
    const a = dir + spread;
    s.rotation = a;
    const len = (0.5 + Math.random() * 0.5) * k;
    s.scale.set(len * 1.8, len * 0.28); // 進む向きに細長い
    fx.addChild(s);
    const d = w * (0.55 + Math.random() * 0.75) * (0.9 + 0.2 * power);
    const dur = 0.24 + Math.random() * 0.18;
    tl.to(s, { x: Math.cos(a) * d, y: Math.sin(a) * d, duration: dur, ease: "power3.out" }, 0.01).to(
      s.scale,
      { x: 0, y: 0, duration: dur * 0.6, ease: "power1.in" },
      0.01 + dur * 0.4,
    );
  }

  await tl.then();
  fx.destroy({ children: true });
  release();
}
