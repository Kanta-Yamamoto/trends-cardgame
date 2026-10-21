import { gsap } from "gsap";
import { fxEnabled, fxStage } from "./stage";

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 絵が砕ける：四角の中から、とがった破片が外へ飛び散り、回りながら落ちていく。紫の火花も散る。
 * 闇堕ちの演出（画面全体を覆う）の上で使うので、そのあいだ舞台を手前に出す。
 */
export async function shatter(
  r: Rect,
  opts: { colors: number[]; zIndex: number; pieces?: number },
): Promise<void> {
  if (!fxEnabled()) return;
  const stage = await fxStage();
  if (!stage) return;
  const { pixi, root, tex } = stage;
  const lower = stage.raise(opts.zIndex);
  const release = stage.hold();
  const fx = new pixi.Container();
  fx.position.set(r.left + r.width / 2, r.top + r.height / 2);
  root.addChild(fx);
  const tl = gsap.timeline();
  const k = r.width / 240;

  const n = opts.pieces ?? 26;
  for (let i = 0; i < n; i++) {
    const g = new pixi.Graphics();
    const s = (12 + Math.random() * 26) * k;
    // とがった三角・四角の破片
    const pts = [
      0,
      -s,
      s * (0.3 + Math.random() * 0.5),
      s * (0.2 + Math.random() * 0.6),
      -s * (0.3 + Math.random() * 0.6),
      s * 0.4,
    ];
    const color = opts.colors[i % opts.colors.length] ?? 0xffffff;
    g.poly(pts).fill({ color, alpha: 0.95 });
    g.poly(pts).stroke({ width: 1.2 * k, color: 0xf3e6ff, alpha: 0.9 });
    g.position.set((Math.random() - 0.5) * r.width * 0.8, (Math.random() - 0.5) * r.height * 0.8);
    g.rotation = Math.random() * Math.PI * 2;
    fx.addChild(g);
    const a = Math.atan2(g.y, g.x) + (Math.random() - 0.5) * 0.6;
    const d = r.width * (0.6 + Math.random() * 0.9);
    const dur = 0.7 + Math.random() * 0.5;
    tl.to(g, { x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d * 0.7, duration: dur, ease: "expo.out" }, 0)
      .to(
        g,
        { y: `+=${r.height * (0.5 + Math.random() * 0.4)}`, duration: dur * 0.9, ease: "power2.in" },
        dur * 0.3,
      )
      .to(g, { rotation: g.rotation + (Math.random() - 0.5) * 8, duration: dur * 1.2, ease: "power1.out" }, 0)
      .to(g, { alpha: 0, duration: dur * 0.4, ease: "power1.in" }, dur * 0.45);
  }
  for (let i = 0; i < 30; i++) {
    const s = new pixi.Sprite(tex.spark);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 2 ? 0xd9b0ff : 0x9a4dff;
    const a = Math.random() * Math.PI * 2;
    s.rotation = a;
    const size = (0.6 + Math.random() * 0.8) * k * 2;
    s.scale.set(size * 1.6, size * 0.3);
    fx.addChild(s);
    const d = r.width * (0.5 + Math.random() * 1.1);
    const dur = 0.35 + Math.random() * 0.3;
    tl.to(s, { x: Math.cos(a) * d, y: Math.sin(a) * d, duration: dur, ease: "power3.out" }, 0).to(
      s.scale,
      { x: 0, y: 0, duration: dur * 0.6, ease: "power1.in" },
      dur * 0.4,
    );
  }
  await tl.then();
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
