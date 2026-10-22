import { gsap } from "gsap";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cone, easeInOut, lerp, type Pt, SQUARE, slash, THIN, toClip } from "../cards/directorMotion";

/**
 * 『フィクサー』が場に出たとき：バトル場が黒に沈み、場のアイコンすべてに上から白い糸が垂れる（見た目だけ。ルールは game-core）。
 * 『演出家』のフィールドと同じ言葉づかいで、テーマの色は黒。
 * 1. 黒い斜線が降りてきて、盤面を覆い切る（速く入って、最後はゆっくり）
 * 2. 『フィクサー』の名前が浮かび、糸が上から1本ずつ垂れて、アイコンの頭につながる
 * 3. 差し出しが決まったら、選ばれたアイコンの糸がぴんと張り、上へ引き抜かれる。ほかの糸はするすると上へ戻る（pull）
 * 4. 黒い幕が上の一点を軸に回って、細い黒い一本の糸になり、ゆっくり閉じて消える（close）
 */
export interface FixerHandle {
  /** 選ばれたアイコンを糸で上へ引き抜く（終わったら resolve） */
  pull: (uids: number[]) => Promise<void>;
  /** 幕を閉じて消える */
  close: () => void;
}

const TILT = 12;
const APEX: Pt = [50, -6];
const IN_MS = 800;
const CURTAIN_MS = 600;
const CLOSE_MS = 1150;

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
  const done = useRef(onDone);
  done.current = onDone;

  // 1. 黒が降りてきて覆い切る
  useEffect(() => {
    const el = ink.current;
    if (!el) return;
    if (reduced()) {
      el.style.clipPath = toClip(SQUARE);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / IN_MS);
      el.style.clipPath = u < 1 ? toClip(slash(lerp(-35, 140, 1 - (1 - u) ** 4), TILT)) : toClip(SQUARE);
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
    const t0 = performance.now();
    const step = (now: number) => {
      const t = now - t0;
      if (t < CURTAIN_MS) {
        const u = t / CURTAIN_MS;
        el.style.clipPath = toClip(cone(lerp((88 * Math.PI) / 180, THIN, 1 - (1 - u) ** 2), APEX));
      } else if (t < CURTAIN_MS + CLOSE_MS) {
        const u = (t - CURTAIN_MS) / CLOSE_MS;
        el.style.clipPath = toClip(cone(lerp(THIN, 0, easeInOut(u)), APEX));
      } else {
        el.style.clipPath = toClip([]);
        done.current();
        return;
      }
      requestAnimationFrame(step);
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
