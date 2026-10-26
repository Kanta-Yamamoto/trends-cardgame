import { type ReactNode, useEffect, useRef } from "react";

/** 印を出しておく時間（スクロールが止まってから消えるまで） */
const SHOW_MS = 900;
/** 印の上下の余白と、いちばん短いときの長さ */
const PAD = 4;
const MIN_THUMB = 24;

/**
 * 枠の中のスクロール（.app-scroll）と、その位置を示す細い印（.app-scrollbar）。
 *
 * 広い画面（PC・横持ち。frame.ts）では、スクロールは枠の中の .app-scroll で行う。PC のブラウザの本物のスクロールバーは
 * 枠の幅 480px の中に入って中身を細くする（Windows では 17px ほど。カード一覧はいつも縦にあふれるので、いつも出る）。
 * そこで本物のバーは消し（app.css）、スマホのように、スクロールしている間だけ細い印を中身の上に重ねて出す（幅を取らない）。
 * スマホの縦（幅 480px まで）では .app-scroll はスクロールしない（ページがスクロールする）ので、印も出ない。
 */
export function AppScroll({ children }: { children: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroll.current;
    const bar = thumb.current;
    if (!el || !bar) return;
    let timer = 0;
    const put = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const over = scrollHeight - clientHeight;
      if (over <= 1) {
        bar.classList.remove("is-on");
        return;
      }
      const track = clientHeight - PAD * 2;
      const h = Math.max(MIN_THUMB, Math.round((clientHeight / scrollHeight) * track));
      const y = PAD + (scrollTop / over) * (track - h);
      bar.style.height = `${h}px`;
      bar.style.transform = `translateY(${y}px)`;
      bar.classList.add("is-on");
      clearTimeout(timer);
      timer = window.setTimeout(() => bar.classList.remove("is-on"), SHOW_MS);
    };
    el.addEventListener("scroll", put, { passive: true });
    return () => {
      el.removeEventListener("scroll", put);
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <div className="app-scroll" ref={scroll}>
        {children}
      </div>
      <div className="app-scrollbar" ref={thumb} aria-hidden="true" />
    </>
  );
}
