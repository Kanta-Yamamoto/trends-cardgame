import { useEffect, useRef } from "react";
import { MID, type Pt, scenes, shapeAt, slash, toClip } from "../cards/directorMotion";
import { CROWN_MS, crownCard, crownSeed, paintCrown } from "../fx/bloodCrown";

/**
 * 『演出家』が場に出たとき、バトル場全体の背景を真紅と黒の二色が支配する演出（見た目だけ。ルールは game-core）。
 * カード面（cards/faces/Director.tsx）と同じ動きと秒数（cards/directorMotion.ts）：
 * 黒い地に斜線が降りてきて止まる → 2 秒止まる → ゆっくり動き出して加速しながら降り切って真紅 →
 * 上の一点を軸に幕のふちが回って細い光の筋になり → ゆっくり閉じて黒 → 消える。
 * バトル場はカードより横長なので、斜線の傾きを少しゆるく（12）、幕の軸を少し下（-6）にしている
 *
 * 舞台に上がるエース（aces）は、ふつうの着地の代わりに「血の滴とクラウン」（fx/bloodCrown.ts）で見せる。
 * 血は背景の地と逆の色で描く（真紅の上では黒、黒の上では真紅。カード面の文字が境目で反転するのと同じ決まり）
 */
const S = scenes(12, [50, -6]);
const SEQ = [S.IN, S.HOLD, S.OUT, S.FULL, S.CURTAIN, S.CLOSE];
/** 演出全体の長さ（このあと 0.5 秒で消える） */
export const DIRECTOR_MS = SEQ.reduce((a, s) => a + s.d, 0);

const RED = "#cf1b10";
const BLACK = "#1c171c";

/** 舞台に上がるエース。at は『演出家』の着地から何ミリ秒後に血の滴が落ち始めるか */
export interface StagedAce {
  uid: number;
  at: number;
}

/** 塗った形（mask）を、背景の地と逆の色にして、見せるキャンバスへ写す */
function compose(out: HTMLCanvasElement, mask: HTMLCanvasElement, shape: Pt[] | null) {
  const c = out.getContext("2d");
  if (!c) return;
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, out.width, out.height);
  c.fillStyle = RED;
  c.fillRect(0, 0, out.width, out.height);
  if (shape && shape.length >= 3) {
    c.fillStyle = BLACK;
    c.beginPath();
    shape.forEach(([x, y], i) => {
      const px = (x / 100) * out.width;
      const py = (y / 100) * out.height;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.closePath();
    c.fill();
  }
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = "source-over";
}

export function DirectorField({ aces = [], onDone }: { aces?: StagedAce[]; onDone: () => void }) {
  const red = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const staged = useRef(aces);

  useEffect(() => {
    const el = red.current;
    const box = root.current;
    const cu = under.current;
    const co = over.current;
    const board = box?.parentElement;
    if (!el || !box || !cu || !co || !board) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // 動きを減らす設定では、止まった二色だけを見せて消す
      el.style.clipPath = toClip(slash(MID, 12));
      const id = window.setTimeout(() => done.current(), 2000);
      return () => window.clearTimeout(id);
    }
    const list = staged.current.map((s) => ({
      ...s,
      rnd: crownSeed(s.uid),
      rect: null as DOMRect | null,
      over: false,
    }));
    const crownEnd = list.reduce((m, s) => Math.max(m, s.at + CROWN_MS), 0);
    const maskU = document.createElement("canvas");
    const maskO = document.createElement("canvas");
    const cardOf = (uid: number) => board.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
    const release = (uid: number) => {
      const card = cardOf(uid);
      if (!card) return;
      for (const p of ["opacity", "transform", "clip-path"]) card.style.removeProperty(p);
    };

    const crown = (t: number, shape: Pt[] | null) => {
      const b = board.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(b.width * dpr);
      const h = Math.round(b.height * dpr);
      for (const c of [cu, co, maskU, maskO])
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      const k = w / Math.max(1, b.width);
      const u = maskU.getContext("2d");
      const o = maskO.getContext("2d");
      if (!u || !o) return;
      for (const c of [u, o]) {
        c.clearRect(0, 0, w, h);
        c.fillStyle = "#000";
        c.strokeStyle = "#000";
      }
      for (const s of list) {
        if (s.over) continue;
        const a = t - s.at;
        const card = cardOf(s.uid);
        if (!card) continue;
        // 位置は、まだ動かしていない（隠しただけの）ときに 1 度だけ測る
        s.rect ??= card.getBoundingClientRect();
        const r = s.rect;
        paintCrown(
          u,
          o,
          a,
          { x: (r.left - b.left) * k, y: (r.top - b.top) * k, w: r.width * k, h: r.height * k },
          s.rnd,
        );
        const st = crownCard(a);
        if (st.hidden) card.style.opacity = "0";
        else if (st.sunk > 0.001) {
          // 枠の下のふちからせり上がる：沈んでいる分だけ下へずらし、ふちより下は切る
          card.style.opacity = "1";
          card.style.transform = `translateY(${(st.sunk * card.offsetHeight).toFixed(2)}px)`;
          card.style.clipPath = `inset(0 0 ${(st.sunk * 100).toFixed(2)}% 0)`;
        } else release(s.uid);
        if (a >= CROWN_MS) s.over = true;
      }
      compose(cu, maskU, shape);
      compose(co, maskO, shape);
    };

    let raf = 0;
    let id = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = now - t0;
      const shape = shapeAt(SEQ, t);
      if (t < crownEnd) crown(t, shape);
      else if (co.width) co.width = cu.width = 0;
      if (shape) {
        el.style.clipPath = toClip(shape);
        raf = requestAnimationFrame(step);
        return;
      }
      el.style.clipPath = toClip([]);
      box.classList.add("out");
      id = window.setTimeout(() => done.current(), 500);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
      for (const s of list) release(s.uid);
    };
  }, []);

  return (
    <>
      <div className="director-field" ref={root} aria-hidden="true">
        <div className="df-red" ref={red} />
        <canvas className="df-crown" ref={under} />
      </div>
      <canvas className="director-crown" ref={over} />
    </>
  );
}
