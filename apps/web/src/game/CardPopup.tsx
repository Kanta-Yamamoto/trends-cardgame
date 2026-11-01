import type { CardDef } from "@trends/cards";
import { useEffect, useState } from "react";
import { HoloCard } from "../cards/HoloCard";

/**
 * カードを押したときの拡大：画面に重ねる小窓に、カードだけを大きく出す（説明の台は出さない。デッキを組む画面・カード一覧）。
 * 上の目のボタン（× の左）で、文字を隠して絵だけを見られる（10月28日。小窓に替えたときに抜けていたのを戻した。
 * カードを押して隠すと、カードを傾ける動きと被るので、ボタンにした。オーナーがモックの D を選んだ）。
 * 闇堕ちを持つカードは、下の切り替えで闇堕ちの姿も見られる。外側・×・Esc で閉じる。
 * nav を渡すと、下に「前へ・次へ」を出して、重ねたまま前後のカードへ移れる（← → キーでも）
 * 対戦の画面でも、どのカードを詳しく見るときもこの小窓を使う（11月2日）。対戦では bigText で効果文を大きくする
 */
export function CardPopup({
  card,
  nav,
  initialDark = false,
  bigText = false,
  onClose,
}: {
  card: CardDef;
  /** 闇堕ちの姿から見せる（場にいる闇堕ちの姿のキャラクター） */
  initialDark?: boolean;
  /** 効果文を大きくする（対戦の画面。オーナー：「詳細表示時の効果文が小さすぎる」） */
  bigText?: boolean;
  /** 並びの中の位置（1 から）と全体の数、前後へ移る関数 */
  nav?: { index: number; total: number; prev: () => void; next: () => void };
  onClose: () => void;
}) {
  const [dark, setDark] = useState(initialDark && !!card.dark);
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
    <div
      className={`card-pop ${bigText ? "big-text" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} を拡大`}
    >
      <button type="button" className="card-pop-bg" aria-label="閉じる" onClick={onClose} />
      <button
        type="button"
        className="card-zoom-close card-pop-eye g1"
        aria-label={textHidden ? "文字を出す" : "文字を隠す"}
        aria-pressed={textHidden}
        onClick={() => setTextHidden((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {textHidden && <path d="M4 4l16 16" />}
        </svg>
      </button>
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
        <HoloCard card={card} darkForm={dark} interactive idle={false} textHidden={textHidden} />
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
