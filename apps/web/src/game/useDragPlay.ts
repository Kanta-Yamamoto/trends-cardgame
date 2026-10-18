import { useEffect, useRef, useState } from "react";

/**
 * カードを指（マウス）で引っぱって、離した場所で出す・投稿する・攻撃する。
 * - 少し動かすまでは普通のタップ・長押しとして扱う（動かし始めたらドラッグ）
 * - 離した場所は、指の下にある `data-drop` の値で決める
 * - スマホのブラウザでも動くように、HTML のドラッグ＆ドロップではなく Pointer Events を使う
 */
export interface DragInfo<S> {
  src: S;
  x: number;
  y: number;
  /** 指の下にある置き場所（data-drop の値） */
  over: string | null;
  /** 引っぱり始めた要素の画面上の位置 */
  rect: DOMRect;
  /** 引っぱり始めた要素の、拡大・縮小する前の幅 */
  width: number;
}

interface Options<S> {
  /** ドラッグを始めてよいか（false なら普通のタップのまま） */
  onStart: (src: S) => boolean;
  onDrop: (src: S, over: string | null) => void;
  onCancel: (src: S) => void;
}

/** 動かしたらドラッグとみなす距離（px） */
export const DRAG_THRESHOLD = 10;

export function dropAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest("[data-drop]");
  return el?.getAttribute("data-drop") ?? null;
}

export function useDragPlay<S>(options: Options<S>) {
  const opts = useRef(options);
  opts.current = options;
  const [drag, setDrag] = useState<DragInfo<S> | null>(null);
  const endedAt = useRef(0);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const begin = (e: React.PointerEvent<HTMLElement>, src: S) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cleanup.current?.();
    const el = e.currentTarget;
    const id = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    let rect = el.getBoundingClientRect();
    const width = el.offsetWidth;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
        if (!opts.current.onStart(src)) return stop();
        started = true;
        rect = el.getBoundingClientRect();
      }
      ev.preventDefault();
      setDrag({ src, x: ev.clientX, y: ev.clientY, over: dropAt(ev.clientX, ev.clientY), rect, width });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (!started) return;
      endedAt.current = performance.now();
      setDrag(null);
      opts.current.onDrop(src, dropAt(ev.clientX, ev.clientY));
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (!started) return;
      endedAt.current = performance.now();
      setDrag(null);
      opts.current.onCancel(src);
    };
    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    cleanup.current = stop;
  };

  /** ドラッグを終えた直後のクリック（指を離したときに出るもの）は無視する */
  const justDragged = () => performance.now() - endedAt.current < 400;

  return { drag, begin, justDragged };
}
