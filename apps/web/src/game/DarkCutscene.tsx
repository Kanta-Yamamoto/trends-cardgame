import type { CardDef } from "@trends/cards";
import { gsap } from "gsap";
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import { disintegrate, embers } from "../fx/shatter";

export interface DarkCut {
  id: number;
  cardId: string;
  mine: boolean;
  /** 演出が終わったら呼ぶ（このあと盤面が進む） */
  done: () => void;
}

/** 闇堕ちの演出は画面全体（z-index 200）。PixiJS の砂の粒はその上に出す */
const Z_PIXI = 210;

/**
 * 闇堕ちの演出（約 2.4 秒）。時間の流れを 4 つに分けて、重みと緩急をつける。
 * 1. 溜め（0〜0.75 秒）：画面が闇に沈み、元の絵がゆっくり迫りながら色を失い、小刻みに震えが強くなる
 * 2. 解放（0.78 秒〜）：元の絵が左から右へ黒い砂になって流れ去り、その奥から闇堕ちの姿が浮かぶ。
 *    画面全体を揺らしたり白く光らせたりはしない（盤面が透けて点滅して見え、処理落ちのように見えるため）
 * 3. 衝撃（0.9 秒〜）：闇堕ちの姿が飛び込み、斜めの帯に「闇堕ち」の字が 1 字ずつ叩きつけられる
 * 4. 余韻（〜2.4 秒）：紫の火の粉がゆっくり昇り、字がわずかに迫る。最後は一気に抜けて消える
 * 自分・相手どちらの闇堕ちでも出す。押すと飛ばせる。
 */
export function DarkCutscene({
  card,
  mine,
  ownerName,
  onDone,
}: {
  card: CardDef;
  mine: boolean;
  ownerName: string;
  onDone: () => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const $ = (sel: string) => el.querySelectorAll<HTMLElement>(sel);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done.current();
    };
    if (reduce) {
      gsap.set($(".dc-to"), { opacity: 1 });
      gsap.set($(".dc-from"), { opacity: 0 });
      const t = gsap.timeline({ onComplete: finish });
      t.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 }).to(el, { opacity: 0, duration: 0.2 }, 0.9);
      tl.current = t;
      return () => {
        t.kill();
      };
    }

    const portrait = el.querySelector<HTMLElement>(".dc-portrait");
    if (!portrait) return;
    const chars = $(".dc-title i");
    const t = gsap.timeline({ onComplete: finish });
    tl.current = t;

    // 初期状態
    gsap.set($(".dc-veil"), { opacity: 0 });
    gsap.set($(".dc-tendrils"), { opacity: 0, scale: 1.25 });
    gsap.set(portrait, { opacity: 0, scale: 0.86, y: 18 });
    gsap.set($(".dc-from"), { filter: "saturate(1) brightness(1)", "--cut": "0%" });
    gsap.set($(".dc-to"), { opacity: 0, scale: 1.12, filter: "brightness(0.4)" });
    gsap.set($(".dc-flash"), { opacity: 0 });
    gsap.set($(".dc-band"), { scaleX: 0, opacity: 1 });
    gsap.set(chars, { opacity: 0, scale: 3.2, y: -10 });
    gsap.set($(".dc-sub"), { opacity: 0, x: mine ? -40 : 40 });

    // 1. 溜め：闇に沈む → 元の絵が近づきながら色を失う。震えはだんだん強く
    t.to($(".dc-veil"), { opacity: 1, duration: 0.3, ease: "power2.out" }, 0)
      .to($(".dc-tendrils"), { opacity: 1, scale: 1, duration: 0.8, ease: "power1.in" }, 0.05)
      .to(portrait, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0.05)
      .to(portrait, { scale: 1.07, duration: 0.42, ease: "power2.in" }, 0.36)
      .to(
        $(".dc-from"),
        { filter: "saturate(0.15) brightness(0.55)", duration: 0.42, ease: "power1.in" },
        0.36,
      );
    for (let i = 0; i < 7; i++) {
      const p = 1.5 + i * 1.2;
      t.to(
        portrait,
        { x: (i % 2 ? 1 : -1) * p, rotation: (i % 2 ? 1 : -1) * p * 0.15, duration: 0.05, ease: "none" },
        0.42 + i * 0.05,
      );
    }
    // 2. 解放：震えを止めてから、元の絵を左から右へ砂にする。闇堕ちの姿は砂の奥から浮かぶ
    const BREAK = 0.78;
    const SWEEP = 0.6;
    const fromArt = card.art;
    t.to(portrait, { x: 0, rotation: 0, duration: 0.03, ease: "power1.out" }, BREAK - 0.01)
      .add(() => {
        const r = portrait.getBoundingClientRect();
        void disintegrate(r, fromArt, { zIndex: Z_PIXI, sweep: SWEEP });
      }, BREAK + 0.03)
      .to($(".dc-from"), { "--cut": "108%", duration: SWEEP, ease: "none" }, BREAK + 0.03)
      .to($(".dc-flash"), { opacity: 1, duration: 0.25, ease: "power1.out" }, BREAK + 0.1)
      .to($(".dc-flash"), { opacity: 0, duration: 0.6, ease: "power1.inOut" }, BREAK + 0.35)
      .to(
        $(".dc-to"),
        { opacity: 1, scale: 1, filter: "brightness(1)", duration: 0.7, ease: "power2.out" },
        BREAK + 0.25,
      );

    // 3. 衝撃：斜めの帯がはしり、「闇堕ち」の字を 1 字ずつ叩きつける（大きく速く → 止まる）
    const SLAM = 0.98;
    t.to($(".dc-band"), { scaleX: 1, duration: 0.22, ease: "expo.out" }, SLAM - 0.08)
      .to(chars, { opacity: 1, scale: 1, y: 0, duration: 0.11, ease: "power4.in", stagger: 0.07 }, SLAM)
      .to($(".dc-sub"), { opacity: 1, x: 0, duration: 0.35, ease: "expo.out" }, SLAM + 0.28);
    // 最後の字が当たった瞬間の小さな揺れ
    const LAST = SLAM + 0.11 + 0.07 * Math.max(0, chars.length - 1);
    [
      [6, -3],
      [-5, 2],
      [0, 0],
    ].forEach(([x, y], i) => {
      // 画面全体ではなく、帯と字だけを揺らす（全体を揺らすと、ふちから盤面が透けて点滅して見える）
      t.to($(".dc-band, .dc-text"), { y, x, duration: 0.04, ease: "none" }, LAST + i * 0.04);
    });

    // 4. 余韻：火の粉が昇り、字がわずかに迫る → 最後は一気に抜ける
    t.add(() => void embers(1.4, Z_PIXI), BREAK + 0.1)
      .to($(".dc-title"), { scale: 1.05, duration: 1.0, ease: "sine.out" }, LAST)
      .to($(".dc-to"), { scale: 1.04, duration: 1.2, ease: "sine.out" }, BREAK + 0.5);
    const OUT = 2.05;
    t.to(
      $(".dc-band, .dc-text"),
      { x: mine ? "60%" : "-60%", opacity: 0, duration: 0.22, ease: "power3.in" },
      OUT,
    )
      .to(portrait, { scale: 1.15, opacity: 0, duration: 0.3, ease: "power2.in" }, OUT)
      .to($(".dc-veil, .dc-tendrils"), { opacity: 0, duration: 0.35, ease: "power1.in" }, OUT + 0.05);

    return () => {
      t.kill();
    };
  }, [mine, card.art]);

  const vars = {
    "--from": card.art ? `url(${card.art})` : "none",
    "--to": card.dark?.art ? `url(${card.dark.art})` : card.art ? `url(${card.art})` : "none",
  } as CSSProperties;
  const darkName = card.dark?.name ?? card.name;
  return (
    <button
      ref={root}
      type="button"
      className={`dark-cut ${mine ? "mine" : "foe"}`}
      style={vars}
      onClick={() => tl.current?.progress(1)}
      aria-label={`${ownerName}の ${card.name} が闇堕ちした（押すと飛ばせます）`}
    >
      <span className="dc-veil" />
      <span className="dc-tendrils" />
      <span className="dc-portrait">
        <span className="dc-art dc-from" />
        <span className="dc-art dc-to" />
      </span>
      <span className="dc-flash" />
      <span className="dc-band" />
      <span className="dc-text">
        <strong className="dc-title" aria-hidden="true">
          {["闇", "堕", "ち"].map((c) => (
            <i key={c}>{c}</i>
          ))}
        </strong>
        <span className="dc-sub">
          <small>{ownerName}の</small>
          {card.name}
          <b aria-hidden="true">▶</b>
          <em>{darkName}</em>
        </span>
      </span>
      <span className="dc-skip">押すと飛ばせます</span>
    </button>
  );
}
