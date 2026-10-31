import type { Attribute } from "@trends/cards";
import { gsap } from "gsap";
import { LANDING_HIT, playSe } from "../sound/se";
import { paletteOf } from "./palette";
import { fxEnabled, fxStage } from "./stage";
import { summonWave } from "./summonWave";

type Rect = { left: number; top: number; width: number; height: number };

/**
 * キャラクターがバトル場に出たときの演出。時間を 4 つに分けて、重みと緩急をつける。
 * 1. 溜め（0.16 秒）：枠の上にふわっと浮かび、少しだけふくらむ（ゆっくり）
 * 2. 解放（0.1 秒）：枠へ一気に叩きつける（速く）
 * 3. 衝撃：着地の瞬間につぶれて止まり、白く光る。足もとに属性の色の輪と火花（PixiJS）。★4 以上は光の柱と盤面の揺れ、★5 は波動も
 * 4. 余韻（0.35 秒）：弾んで元の形に落ち着く
 * ★が高いほど、溜めが長く・衝撃が大きい。
 *
 * 要素はもう画面にあるので、呼んだその場で隠し（描かれる前）、delayMs 後に動かし始める。
 */
export function fieldEntry(
  el: HTMLElement | null,
  card: { attributes: readonly Attribute[]; rarity: number },
  delayMs = 0,
) {
  if (!el) return;
  if (!fxEnabled()) {
    // 動きを減らす設定でも、出たことは音で分かるように
    playSe("landing");
    return;
  }
  const r = Math.max(1, Math.min(5, card.rarity));
  const big = r >= 4;
  const lift = 30 + r * 4;
  gsap.set(el, { opacity: 0, y: -lift, scale: 1.2, filter: "brightness(1.8)" });

  const tl = gsap.timeline({ delay: delayMs / 1000 });
  const charge = 0.12 + r * 0.02;
  const fall = 0.1;
  // 1. 溜め：浮かんで、少しふくらむ
  tl.to(el, { opacity: 1, y: -lift - 8, scale: 1.28, duration: charge, ease: "power1.out" })
    // 2. 解放：叩きつける
    .to(el, { y: 0, scale: 1, duration: fall, ease: "power4.in" })
    // 3. 衝撃：つぶれて一瞬止まる（ヒットストップ）
    .add(() => {
      // 着地した瞬間を知らせる（登場時の演出を、着地に合わせて始めるため。landed() が待つ）
      el.dispatchEvent(new CustomEvent("fx-landed", { bubbles: true }));
      void landingImpact(el.getBoundingClientRect(), card.attributes, r);
      if (big) shakeBoard(r === 5 ? 6 : 3);
      if (r === 5) void summonWave(el, card.attributes);
    })
    .to(el, { scaleX: 1.1, scaleY: 0.9, filter: "brightness(2.2)", duration: 0.04, ease: "power1.out" })
    .to({}, { duration: big ? 0.07 : 0.04 })
    // 4. 余韻：弾んで落ち着く
    .to(el, { scaleX: 1, scaleY: 1, duration: 0.35, ease: "back.out(3)" })
    .to(el, { filter: "brightness(1)", duration: 0.4, ease: "sine.out" }, "<")
    .set(el, { clearProps: "opacity,transform,filter" });
  // 音の山が着地に重なるよう、★で変わる溜めの長さに合わせて鳴らし始める（動きを組んだあとに差し込む。先に入れると動きが後ろへずれる）
  tl.call(() => playSe("landing"), undefined, charge + fall - LANDING_HIT);
}

/** 盤面を小刻みに揺らす（★4・★5 の着地） */
function shakeBoard(px: number) {
  const board = document.querySelector<HTMLElement>(".board");
  if (!board) return;
  const steps = [
    [px, -px * 0.6],
    [-px * 0.8, px * 0.5],
    [px * 0.5, px * 0.3],
    [-px * 0.3, -px * 0.2],
    [0, 0],
  ];
  const t = gsap.timeline();
  for (const [x, y] of steps) t.to(board, { x, y, duration: 0.04, ease: "none" });
  t.set(board, { clearProps: "transform" });
}

/** 着地の衝撃：足もとに広がる輪、横へ飛ぶ火花、中心の光。★4 以上は光の柱 */
async function landingImpact(rect: Rect, attributes: readonly Attribute[], rarity: number): Promise<void> {
  const stage = await fxStage();
  if (!stage) return;
  const { pixi, root, tex } = stage;
  const pal = paletteOf(attributes);
  const w = rect.width;
  const k = w / 80;
  const fx = new pixi.Container();
  // 足もと（カードの下のほう）を中心にする
  fx.position.set(rect.left + w / 2, rect.top + rect.height * 0.86);
  root.addChild(fx);
  const release = stage.hold();
  const tl = gsap.timeline();
  const size = 1 + (rarity - 1) * 0.12;

  // 中心の光（カードの真ん中）
  const flash = new pixi.Sprite(tex.glow);
  flash.anchor.set(0.5);
  flash.tint = pal.light;
  flash.blendMode = "add";
  flash.y = -rect.height * 0.36;
  const fs = (w * 1.6 * size) / tex.glow.width;
  flash.scale.set(fs * 0.4);
  fx.addChild(flash);
  tl.to(flash.scale, { x: fs, y: fs, duration: 0.18, ease: "expo.out" }, 0).to(
    flash,
    { alpha: 0, duration: 0.3, ease: "power2.in" },
    0.05,
  );

  // 足もとの輪（つぶれた楕円で、床に広がって見える）
  const rings = rarity >= 4 ? 2 : 1;
  for (let i = 0; i < rings; i++) {
    const g = new pixi.Graphics();
    g.blendMode = "add";
    g.scale.y = 0.34;
    fx.addChild(g);
    const o = { p: 0 };
    const color = i === 0 ? pal.main : pal.sub;
    tl.to(
      o,
      {
        p: 1,
        duration: 0.5 + i * 0.1,
        ease: "expo.out",
        onUpdate: () => {
          g.clear();
          const a = 1 - o.p;
          if (a <= 0.01) return;
          const rad = w * (0.35 + (0.75 + 0.2 * i) * size * o.p);
          g.circle(0, 0, rad).stroke({ width: (6 - 5 * o.p) * k, color, alpha: a });
          g.circle(0, 0, rad).stroke({ width: (14 - 10 * o.p) * k, color, alpha: a * 0.2 });
        },
      },
      i * 0.06,
    );
  }

  // 火花：床すれすれを左右へ
  const n = 6 + rarity * 3;
  for (let i = 0; i < n; i++) {
    const s = new pixi.Sprite(tex.spark);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 3 === 0 ? pal.light : i % 3 === 1 ? pal.main : pal.sub;
    const side = i % 2 ? 1 : -1;
    const a = (side > 0 ? 0 : Math.PI) + side * -(0.05 + Math.random() * 0.45);
    s.rotation = a;
    const len = (0.4 + Math.random() * 0.5) * k;
    s.scale.set(len * 1.6, len * 0.3);
    fx.addChild(s);
    const d = w * (0.5 + Math.random() * 0.7) * size;
    const dur = 0.3 + Math.random() * 0.25;
    tl.to(s, { x: Math.cos(a) * d, y: Math.sin(a) * d, duration: dur, ease: "power3.out" }, 0).to(
      s.scale,
      { x: 0, y: 0, duration: dur * 0.5, ease: "power1.in" },
      dur * 0.5,
    );
  }

  // ★4 以上：光の柱
  if (rarity >= 4) {
    const pillar = new pixi.Sprite(tex.glow);
    pillar.anchor.set(0.5, 1);
    pillar.tint = pal.light;
    pillar.blendMode = "add";
    pillar.alpha = 0;
    const sx = (w * (rarity === 5 ? 0.9 : 0.6)) / tex.glow.width;
    const sy = (rect.height * (rarity === 5 ? 4 : 3)) / tex.glow.height;
    pillar.scale.set(sx, sy * 0.3);
    pillar.y = rect.height * 0.1;
    fx.addChild(pillar);
    tl.to(pillar, { alpha: 0.9, duration: 0.05 }, 0)
      .to(pillar.scale, { y: sy, duration: 0.25, ease: "expo.out" }, 0)
      .to(pillar.scale, { x: sx * 0.2, duration: 0.45, ease: "power2.in" }, 0.12)
      .to(pillar, { alpha: 0, duration: 0.35, ease: "power1.in" }, 0.22);
  }

  await tl.then();
  fx.destroy({ children: true });
  release();
}

/**
 * 場に出た uid のキャラクターが着地するまで待つ（fieldEntry の衝撃の瞬間）。
 * 演出を切っている・要素が見つからないときのために、limitMs で打ち切る
 */
export function landed(uid: number, limitMs = 700): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      document.removeEventListener("fx-landed", on);
      window.clearTimeout(id);
      resolve();
    };
    const on = (e: Event) => {
      if ((e.target as HTMLElement | null)?.dataset?.uid === String(uid)) finish();
    };
    document.addEventListener("fx-landed", on);
    const id = window.setTimeout(finish, fxEnabled() ? limitMs : 0);
  });
}
