import { useEffect, useRef } from "react";
import { MID, scenes, shapeAt, slash, toClip } from "../cards/directorMotion";

/**
 * 『演出家』が場に出たとき、バトル場全体の背景を真紅と黒の二色が支配する演出（見た目だけ。ルールは game-core）。
 * カード面（cards/faces/Director.tsx）と同じ動きと秒数（cards/directorMotion.ts）：
 * 黒い地に斜線が降りてきて止まる（エースは『演出家』の着地の 0.4 秒後、斜線が降りてくる間に舞台に上がる）→ 2 秒止まる → ゆっくり動き出して加速しながら降り切って真紅 →
 * 上の一点を軸に幕のふちが回って細い光の筋になり → ゆっくり閉じて黒 → 消える。
 * バトル場はカードより横長なので、斜線の傾きを少しゆるく（12）、幕の軸を少し下（-6）にしている
 */
const S = scenes(12, [50, -6]);
const SEQ = [S.IN, S.HOLD, S.OUT, S.FULL, S.CURTAIN, S.CLOSE];
/** 演出全体の長さ（このあと 0.5 秒で消える） */
export const DIRECTOR_MS = SEQ.reduce((a, s) => a + s.d, 0);

export function DirectorField({ onDone }: { onDone: () => void }) {
  const red = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const el = red.current;
    const box = root.current;
    if (!el || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // 動きを減らす設定では、止まった二色だけを見せて消す
      el.style.clipPath = toClip(slash(MID, 12));
      const id = window.setTimeout(() => done.current(), 2000);
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const shape = shapeAt(SEQ, now - t0);
      if (shape) {
        el.style.clipPath = toClip(shape);
        raf = requestAnimationFrame(step);
        return;
      }
      el.style.clipPath = toClip([]);
      box.classList.add("out");
      window.setTimeout(() => done.current(), 500);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="director-field" ref={root} aria-hidden="true">
      <div className="df-red" ref={red} />
    </div>
  );
}
