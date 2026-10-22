import { useEffect, useRef } from "react";
import { clipBy, lerp, type Pt, SQUARE, toClip } from "../cards/directorMotion";

/**
 * 『調停者』が場に出て刃を振るう間、バトル場全体が青のフィールドになる（見た目だけ。ルールは game-core）。
 * 絵と同じ二色：夜の紺の地に、群青の帯が左上から右下へ斜めに走る（刃の向きと同じ右下がり）。
 * 『演出家』のフィールドと同じ速さの付け方：入るときは速く入って最後はゆっくり止まり、
 * 出るときはゆっくり動き出して加速しながら抜ける。
 * leaving が true になったら帯が抜けて、地が消えてから onDone を呼ぶ
 */
const TILT = -16; // 右下がり
const WIDTH = 24; // 帯の太さ（盤面の高さの %）
const REST = 27; // 止まる高さ（帯の中心）。相手の場と自分の場の間

/** 中心の高さ y の、右下がりの帯 */
function band(y: number): Pt[] {
  const top = y - WIDTH / 2;
  const bot = y + WIDTH / 2;
  // 下の線より上、上の線より下
  const above = clipBy(SQUARE, [100, bot - TILT], [0, bot + TILT]);
  return clipBy(above, [0, top + TILT], [100, top - TILT]);
}

const IN_MS = 900;
const OUT_MS = 650;

export function ArbiterField({ leaving, onDone }: { leaving: boolean; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const bandEl = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // 入る：帯が左上から降りてきて、真ん中で止まる
  useEffect(() => {
    const el = bandEl.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.clipPath = toClip(band(REST));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / IN_MS);
      el.style.clipPath = toClip(band(lerp(-40, REST, 1 - (1 - u) ** 5)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 出る：帯が加速しながら右下へ抜けて、地が消える
  useEffect(() => {
    if (!leaving) return;
    const el = bandEl.current;
    const box = root.current;
    if (!el || !box) return;
    let raf = 0;
    let id = 0;
    const fade = () => {
      box.classList.add("out");
      id = window.setTimeout(() => done.current(), 450);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fade();
      return () => window.clearTimeout(id);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / OUT_MS);
      el.style.clipPath = toClip(band(lerp(REST, 150, u ** 3)));
      if (u < 1) raf = requestAnimationFrame(step);
      else fade();
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, [leaving]);

  return (
    <div className="arbiter-field" ref={root} aria-hidden="true">
      <div className="af-band" ref={bandEl} />
    </div>
  );
}
