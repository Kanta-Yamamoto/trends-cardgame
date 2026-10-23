import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { type Bleed, bleedMask, makeBleed, paintMask } from "../cards/inkBleed";

/**
 * 『フィクサー』が場に出たとき：バトル場が黒に滲む（見た目だけ。ルールは game-core）。
 * カード面と同じ「白が滲んで黒になる」動き（cards/inkBleed.ts）で、テーマの色は黒。糸や名前の帯は出さない（言葉ではなく動きで見せる）。
 * 1. 紙に墨が染みこむように、盤面のふちから黒がゆっくり滲んで、全面が黒になる
 * 2. 黒のまま差し出しを選ぶ。決まったら、差し出されたアイコンを黒い閃光で貫く（fx/blackFlash.ts。ここではない）
 * 3. 黒のまま残り、ターンが終わったら、黒が滲んで引いていき、元の盤面に戻る（close）
 */
export interface FixerHandle {
  /** 黒が滲んで引き、消える */
  close: () => void;
}

/** 滲んで黒になるまで・滲んで戻るまでの長さ */
const IN_MS = 2200;
const OUT_MS = 2200;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function FixerField({ onDone, ref }: { onDone: () => void; ref?: Ref<FixerHandle> }) {
  const ink = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const bleed = useRef<Bleed | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // 1. 盤面のふちから黒が滲んで、全面が黒になる（盤面の比に合わせた低い解像度の場）
  useEffect(() => {
    const el = ink.current;
    if (!el) return;
    const w = 40;
    const h = Math.max(20, Math.round((w * el.offsetHeight) / Math.max(1, el.offsetWidth)));
    bleed.current = makeBleed(w, h, 23, [0.5, 0.45]);
    const b = bleed.current;
    if (reduced()) {
      paintMask(el, bleedMask(b, 1));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / IN_MS);
      paintMask(el, bleedMask(b, u));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = ink.current;
    if (!el || reduced()) {
      done.current();
      return;
    }
    const b = bleed.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / OUT_MS);
      if (b) paintMask(el, bleedMask(b, 1 - u));
      if (u < 1) requestAnimationFrame(step);
      else done.current();
    };
    requestAnimationFrame(step);
  };

  useImperativeHandle(ref, () => ({ close }));

  return (
    <div className="fixer-field" aria-hidden="true">
      <div className="ff-ink" ref={ink} />
    </div>
  );
}
