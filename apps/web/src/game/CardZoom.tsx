import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { useEffect, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText, HelpTerm } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { stars } from "../cards/meta";

/**
 * カードを画面いっぱいに大きく見せる（スマホで効果を読むため）。
 * 場のキャラクターなら、今の攻撃力・体力・状態も添える。カードを押すと文字を隠して絵だけを見られる。
 * キーワード・状態・仕組みの説明は並べない。語を押すと解説の小窓が開く（docs/card-text.md「考え方」）。
 * darkPreview のときは、闇堕ちを持つカードの「闇堕ちすると」の姿と効果を添え、絵も切り替えられる
 * （対戦中もカード一覧でも）。initialDark で最初から闇堕ちの姿で開く。
 * nav を渡すと、下に「前へ・次へ」を出して、拡大したまま前後のカードへ移れる（← → キーでも）。
 */
export function CardZoom({
  card,
  view,
  darkPreview = false,
  initialDark = false,
  nav,
  onClose,
}: {
  card: CardDef;
  view?: UnitView;
  darkPreview?: boolean;
  initialDark?: boolean;
  /** 一覧の中の位置（1 から）と全体の数、前後へ移る関数 */
  nav?: { index: number; total: number; prev: () => void; next: () => void };
  onClose: () => void;
}) {
  const [textHidden, setTextHidden] = useState(false);
  const [showDark, setShowDark] = useState(initialDark);
  const isDarkUnit = !!view?.unit.dark;
  // まだ闇堕ちしていないカードの、闇堕ちの姿を見られるか
  const canPreview = darkPreview && !!card.dark && !isDarkUnit;
  const previewing = canPreview && showDark;
  const dark = !!card.dark && (isDarkUnit || previewing);
  const name = dark ? card.dark?.name : card.name;
  const effect = dark ? (card.dark?.effect ?? "") : card.effect;
  // 闇堕ちの姿を試しに見ているときは、場の今の値ではなく闇堕ちの姿の値を出す
  const live = previewing ? undefined : view;
  const keywords = live?.keywords ?? (dark ? (card.dark?.keywords ?? []) : card.keywords);
  // 効果文に書いていないキーワード（バズなどで付いたもの）だけを札で出す
  const gained = keywords.filter((k) => !effect.includes(`${k}。`));

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
    <div className="zoom-sheet card-zoom" role="dialog" aria-modal="true" aria-label={`${name} を拡大`}>
      {/* 地はカードの絵をぼかして、明るい幕を重ねる */}
      <button type="button" className="zoom-sheet-bg card-zoom-bg" aria-label="閉じる" onClick={onClose}>
        {card.art && <span className="card-zoom-art" style={{ backgroundImage: `url(${card.art})` }} />}
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
      <div className="zoom-sheet-body">
        <div className="zoom-sheet-card">
          <span className="card-zoom-halo" aria-hidden="true" />
          <HoloCard
            darkForm={dark}
            card={card}
            interactive
            idle={false}
            textHidden={textHidden}
            onClick={() => setTextHidden((v) => !v)}
          />
        </div>
        <div className="zoom-sheet-text">
          <p className="zs-meta">
            {card.type === "icon" ? "キャラクター" : "呪文"}・{stars(card.rarity)}・コスト {card.cost}
          </p>
          <h2>
            {name}
            {dark && <small className="zs-dark">闇堕ちの姿</small>}
          </h2>
          <AttrChips card={card} />
          {card.type === "icon" && (
            <p className="zs-stats">
              <span className="zs-st">
                <b className="zs-ball atk">{live?.attack ?? (dark ? card.dark?.attack : card.attack)}</b>
                攻撃力
              </span>
              <span className="zs-st">
                <b className="zs-ball hp">{live ? live.hp : dark ? card.dark?.hp : card.hp}</b>
                体力
                {live && live.hp < live.maxHp && <span className="zs-max">（最大 {live.maxHp}）</span>}
              </span>
            </p>
          )}
          {effect && (
            <p className="zs-effect">
              <EffectText text={effect} />
            </p>
          )}
          {gained.length > 0 && (
            <p className="zs-tags">
              {gained.map((k) => (
                <HelpTerm key={k} term={k} className="zs-tag" />
              ))}
            </p>
          )}
          {live && (live.exposed || live.unit.exposeAtTurnEnd || live.asleep || live.unit.silenced) && (
            <p className="zs-tags zs-states">
              {live.exposed && <HelpTerm term="晒し状態" className="zs-tag" />}
              {live.unit.exposeAtTurnEnd && (
                <span className="zs-tag">
                  <EffectText text="このターンの終わりに晒し状態になる" />
                </span>
              )}
              {live.asleep && <HelpTerm term="眠り状態" className="zs-tag" />}
              {live.unit.silenced && <HelpTerm term="沈黙状態" className="zs-tag" />}
            </p>
          )}
          {canPreview && card.dark && !previewing && (
            <div className="zs-darkbox">
              <p className="zs-darkbox-head">
                <HelpTerm term="闇堕ち" />
                すると <b>{card.dark.name}</b>
                <span className="zs-darkbox-stats">
                  <b className="t-atk">{card.dark.attack}</b>／<b className="t-hp">{card.dark.hp}</b>
                </span>
              </p>
              <p className="zs-darkbox-effect">
                <EffectText text={card.dark.effect} />
              </p>
            </div>
          )}
          {canPreview && (
            <button type="button" className="btn ghost" onClick={() => setShowDark((v) => !v)}>
              {showDark ? "元の姿に戻す" : "闇堕ちの姿を見る"}
            </button>
          )}
          <p className="zs-note">カードを押すと、文字を隠して絵だけを見られます</p>
        </div>
      </div>
      {nav && (
        <nav className="zs-nav" aria-label="前後のカード">
          <button type="button" className="btn ghost" onClick={nav.prev} disabled={nav.index <= 1}>
            ‹ 前へ
          </button>
          <span className="zs-nav-pos">
            {nav.index} / {nav.total}
          </span>
          <button type="button" className="btn ghost" onClick={nav.next} disabled={nav.index >= nav.total}>
            次へ ›
          </button>
        </nav>
      )}
    </div>
  );
}
