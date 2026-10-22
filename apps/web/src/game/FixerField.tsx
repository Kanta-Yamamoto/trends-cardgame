import { gsap } from "gsap";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type Bleed, bleedMask, makeBleed, paintMask } from "../cards/inkBleed";

/**
 * 『フィクサー』が場に出たとき：バトル場が黒に滲み、場のアイコンすべてに上から白い糸が垂れる（見た目だけ。ルールは game-core）。
 * カード面と同じ「白が滲んで黒になる」動き（cards/inkBleed.ts）で、テーマの色は黒。
 * 1. 紙に墨が染みこむように、盤面のふちから黒がゆっくり滲んで、全面が黒になる
 * 2. 『フィクサー』の名前が浮かび、糸が上から1本ずつ垂れて、アイコンの頭につながる
 * 3. 差し出しが決まったら、選ばれたアイコンの糸がぴんと張り、上へ引き抜かれる。ほかの糸はするすると上へ戻る（pull）
 * 4. 黒のまま残り、ターンが終わったら、黒が滲んで引いていき、元の盤面に戻る（close）
 */
export interface FixerHandle {
  /** 選ばれたアイコンを糸で上へ引き抜く（終わったら resolve） */
  pull: (uids: number[]) => Promise<void>;
  /** 黒が滲んで引き、消える */
  close: () => void;
}

/** 滲んで黒になるまで・滲んで戻るまでの長さ */
const IN_MS = 2200;
const OUT_MS = 2200;

interface Thread {
  uid: number;
  x: number;
  y: number;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function FixerField({
  mine,
  exclude,
  onDone,
  ref,
}: {
  mine: boolean;
  /** 糸を垂らさないアイコン（『フィクサー』自身） */
  exclude?: number;
  onDone: () => void;
  ref?: Ref<FixerHandle>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [size, setSize] = useState({ w: 100, h: 100 });
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

  // 2. 場のアイコンの頭の位置を測って、糸を張る（舞台は拡大縮小されているので、舞台の中の大きさに直す）
  useEffect(() => {
    const box = root.current?.parentElement;
    if (!box) return;
    const id = window.setTimeout(() => {
      const b = box.getBoundingClientRect();
      const scale = b.width / box.offsetWidth || 1;
      const list: Thread[] = [];
      for (const el of box.querySelectorAll<HTMLElement>(".unit[data-uid]")) {
        const uid = Number(el.dataset.uid);
        if (!Number.isFinite(uid) || uid === exclude) continue;
        const r = el.getBoundingClientRect();
        list.push({
          uid,
          x: (r.left + r.width / 2 - b.left) / scale,
          y: (r.top - b.top) / scale + 2,
        });
      }
      setSize({ w: box.offsetWidth, h: box.offsetHeight });
      setThreads(list);
    }, 60);
    return () => window.clearTimeout(id);
  }, [exclude]);

  // 糸が上から垂れてくる
  useEffect(() => {
    const s = svg.current;
    if (!s || threads.length === 0) return;
    const lines = s.querySelectorAll<SVGLineElement>("line");
    for (const [i, l] of [...lines].entries()) {
      const len = Number(l.getAttribute("y2"));
      gsap.fromTo(
        l,
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: reduced() ? 0 : 0.55, delay: 0.45 + i * 0.07, ease: "power2.out" },
      );
    }
  }, [threads]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = ink.current;
    const box = root.current;
    if (!el || !box || reduced()) {
      done.current();
      return;
    }
    box.classList.add("closing");
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

  useImperativeHandle(ref, () => ({
    close,
    pull: async (uids) => {
      const box = root.current?.parentElement;
      const s = svg.current;
      if (!box || !s || reduced()) return;
      const b = box.getBoundingClientRect();
      const scale = b.width / box.offsetWidth || 1;
      const tl = gsap.timeline();
      for (const l of s.querySelectorAll<SVGLineElement>("line")) {
        const uid = Number(l.dataset.thread);
        const len = Number(l.getAttribute("y2"));
        const card = box.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
        if (uids.includes(uid) && card) {
          const r = card.getBoundingClientRect();
          const rise = (r.bottom - b.top) / scale + 40;
          // 張る：糸が光って太くなり、カードが一度沈む
          tl.to(l, { attr: { "stroke-width": 2.4 }, opacity: 1, duration: 0.14, ease: "power2.out" }, 0)
            .to(card, { y: 6, duration: 0.14, ease: "power2.out" }, 0)
            // 引き抜く：糸ごと上へ（ゆっくり動き出して加速）
            .to(card, { y: -rise, rotate: uid % 2 ? 6 : -6, duration: 0.6, ease: "power3.in" }, 0.26)
            .to(card, { opacity: 0, duration: 0.2, ease: "none" }, 0.66)
            .to(l, { attr: { y2: Math.max(0, len - rise) }, duration: 0.6, ease: "power3.in" }, 0.26);
        } else {
          // ほかの糸は上へ戻る
          tl.to(l, { strokeDashoffset: len, duration: 0.5, ease: "power2.in" }, 0.3);
        }
      }
      await tl.then();
    },
  }));

  return (
    <>
      <div className="fixer-field" ref={root} aria-hidden="true">
        <div className="ff-ink" ref={ink} />
        <svg
          aria-hidden="true"
          className="ff-threads"
          ref={svg}
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
        >
          {threads.map((t) => (
            <line key={t.uid} data-thread={t.uid} x1={t.x} y1={0} x2={t.x} y2={t.y} />
          ))}
        </svg>
      </div>
      <div className={`fixer-caption ${mine ? "mine" : "foe"}`} aria-hidden="true">
        <small>{mine ? "あなたの" : "相手の"}裏で、誰かが糸を引いている</small>
        <b>『フィクサー』</b>
        <span className="ff-en">FIXER</span>
        <span className="ff-rule">自分と相手は、それぞれ自分のアイコンを1体差し出す</span>
      </div>
    </>
  );
}
