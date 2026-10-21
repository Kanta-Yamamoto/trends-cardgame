import { gsap } from "gsap";
import { fxEnabled, fxStage } from "./stage";

/** 回復の霧の色：白に近いミントとアクア（どの属性の回復でも同じ。「回復した」とひと目で分かる色） */
const MIST = [0xd8fff0, 0xbff6ff, 0xffffff, 0xa8f5d8];

/**
 * 回復したとき、やわらかい霧が足もとから湧いて包み、ほどけながら上へ消える（約 1.2 秒）。
 * 霧の中を小さな光の粒がゆらゆら昇る。アイコンにもマスターの帯にも使える（大きさは要素に合わせる）。
 */
export async function healMist(el: HTMLElement | null): Promise<void> {
  if (!el || !fxEnabled()) return;
  const stage = await fxStage();
  if (!stage || !el.isConnected) return;
  const { pixi, root, tex } = stage;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  // マスターの帯のように横長の要素は、霧を横に広げすぎない
  const w = Math.min(r.width, r.height * 1.6);
  const k = w / 80;

  const fx = new pixi.Container();
  fx.position.set(r.left + r.width / 2, r.top + r.height / 2);
  root.addChild(fx);
  const release = stage.hold();
  const tl = gsap.timeline();

  // 霧：横長のかたまりを下に並べ、ふくらみながら上へほどける
  const n = 12;
  for (let i = 0; i < n; i++) {
    const p = new pixi.Sprite(tex.puff);
    p.anchor.set(0.5);
    p.tint = MIST[i % MIST.length] ?? 0xffffff;
    p.blendMode = "add";
    p.alpha = 0;
    const base = (w * (0.8 + Math.random() * 0.5)) / tex.puff.width;
    p.scale.set(base * 1.3, base * 0.75);
    const spanX = r.width * 0.5;
    p.position.set((Math.random() - 0.5) * spanX * 1.5, r.height * (0.1 + Math.random() * 0.35));
    p.rotation = (Math.random() - 0.5) * 0.6;
    fx.addChild(p);
    const at = i * 0.03;
    const dur = 1.0 + Math.random() * 0.3;
    tl.to(p, { alpha: 0.3 + Math.random() * 0.16, duration: 0.18, ease: "sine.out" }, at)
      .to(
        p,
        {
          y: -r.height * (0.25 + Math.random() * 0.35),
          x: p.x + (Math.random() - 0.5) * w * 0.5,
          rotation: p.rotation + (Math.random() - 0.5) * 0.8,
          duration: dur,
          ease: "sine.inOut",
        },
        at,
      )
      .to(p.scale, { x: base * 1.8, y: base * 1.25, duration: dur, ease: "sine.out" }, at)
      .to(p, { alpha: 0, duration: dur * 0.55, ease: "sine.in" }, at + dur * 0.45);
  }

  // 霧の中を昇る小さな光
  for (let i = 0; i < 10; i++) {
    const s = new pixi.Sprite(tex.spark);
    s.anchor.set(0.5);
    s.tint = i % 2 ? 0xc9fff0 : 0xffffff;
    s.blendMode = "add";
    s.alpha = 0;
    const size = (0.16 + Math.random() * 0.14) * k;
    s.scale.set(size);
    const x0 = (Math.random() - 0.5) * r.width * 0.8;
    s.position.set(x0, r.height * (0.15 + Math.random() * 0.3));
    fx.addChild(s);
    const at = 0.1 + Math.random() * 0.35;
    const dur = 0.8 + Math.random() * 0.3;
    const sway = { t: 0 };
    tl.to(s, { alpha: 1, duration: 0.15 }, at)
      .to(s, { y: -r.height * (0.45 + Math.random() * 0.3), duration: dur, ease: "sine.out" }, at)
      .to(
        sway,
        {
          t: 1,
          duration: dur,
          ease: "none",
          onUpdate: () => {
            s.x = x0 + Math.sin(sway.t * Math.PI * 2.2 + i) * w * 0.07;
          },
        },
        at,
      )
      .to(s, { alpha: 0, duration: 0.35, ease: "sine.in" }, at + dur - 0.35);
  }

  await tl.then();
  fx.destroy({ children: true });
  release();
}
