import type { CardDef } from "@trends/cards";
import { useEffect, useState } from "react";
import { HoloCard } from "../cards/HoloCard";

/**
 * カードを押したときの拡大：画面に重ねる小窓に、カードだけを大きく出す（説明の台は出さない。デッキを組む画面・カード一覧）。
 * カードを押すと、文字を隠して絵だけを見られる（前の拡大 CardZoom と同じ。10月28日、小窓に替えたときに抜けていたのを戻した）。
 * 闇堕ちを持つカードは、下の切り替えで闇堕ちの姿も見られる。外側・×・Esc で閉じる。
 * nav を渡すと、下に「前へ・次へ」を出して、重ねたまま前後のカードへ移れる（← → キーでも）
 */
export function CardPopup({
  card,
  nav,
  onClose,
}: {
  card: CardDef;
  /** 並びの中の位置（1 から）と全体の数、前後へ移る関数 */
  nav?: { index: number; total: number; prev: () => void; next: () => void };
  onClose: () => void;
}) {
  const [dark, setDark] = useState(false);
  const [textHidden, setTextHidden] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && nav && nav.index > 1) nav.prev();
      else if (e.key === "ArrowRight" && nav && nav.index < nav.total) nav.next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, nav]);
  return (
    <div className="card-pop" role="dialog" aria-modal="true" aria-label={`${card.name} を拡大`}>
      <button type="button" className="card-pop-bg" aria-label="閉じる" onClick={onClose} />
      <button type="button" className="card-zoom-close g1" aria-label="閉じる" onClick={onClose}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="card-pop-body">
        <HoloCard
          card={card}
          darkForm={dark}
          interactive
          idle={false}
          textHidden={textHidden}
          onClick={() => setTextHidden((v) => !v)}
        />
        <p className="card-pop-note">カードを押すと、文字を隠して絵だけを見られます</p>
        {card.dark && (
          <div className="seg g3" role="tablist" aria-label="カードの姿">
            <button
              type="button"
              role="tab"
              aria-selected={!dark}
              className={dark ? "" : "on"}
              onClick={() => setDark(false)}
            >
              元の姿
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dark}
              className={dark ? "on" : ""}
              onClick={() => setDark(true)}
            >
              闇堕ちの姿
            </button>
          </div>
        )}
        {nav && (
          <nav className="card-pop-nav" aria-label="前後のカード">
            <button type="button" className="btn ghost" onClick={nav.prev} disabled={nav.index <= 1}>
              ‹ 前へ
            </button>
            <span>
              {nav.index} / {nav.total}
            </span>
            <button type="button" className="btn ghost" onClick={nav.next} disabled={nav.index >= nav.total}>
              次へ ›
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
