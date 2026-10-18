import type { CardDef, Keyword } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { useEffect, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { stars } from "../cards/meta";

/** キーワードの説明（効果文が短いカードでも意味が分かるように） */
const KEYWORD_HELP: Record<Keyword, string> = {
  速攻: "場に出たターンに攻撃できる",
  ガード: "相手は、このアイコン（とほかのガード）しか攻撃できない",
  連撃: "1ターンに2回攻撃できる",
  叩き: "ダメージを受けているアイコンを攻撃するとき、攻撃力+2",
  注目: "自分のターンの始めに攻撃力+1。センターにいると+2",
};

/**
 * カードを画面いっぱいに大きく見せる（スマホで効果を読むため）。
 * 場のアイコンなら、今の攻撃力・体力・状態も添える。カードを押すと文字を隠して絵だけを見られる。
 * darkPreview のときは、闇堕ちを持つカードの闇堕ちの姿に切り替えられる（確認用。ふだんは秘密のまま）。
 */
export function CardZoom({
  card,
  view,
  darkPreview = false,
  onClose,
}: {
  card: CardDef;
  view?: UnitView;
  darkPreview?: boolean;
  onClose: () => void;
}) {
  const [textHidden, setTextHidden] = useState(false);
  const [showDark, setShowDark] = useState(false);
  const canPreview = !view && darkPreview && !!card.dark;
  const dark = !!card.dark && (view ? !!view.unit.dark : canPreview && showDark);
  const name = dark ? card.dark?.name : card.name;
  const effect = dark ? (card.dark?.effect ?? "") : card.effect;
  const keywords = view?.keywords ?? (dark ? (card.dark?.keywords ?? []) : card.keywords);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="zoom-sheet" role="dialog" aria-modal="true" aria-label={`${name} を拡大`}>
      <button type="button" className="zoom-sheet-bg" aria-label="閉じる" onClick={onClose} />
      <div className="zoom-sheet-body">
        <div className="zoom-sheet-card">
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
            {card.type === "icon" ? "アイコン" : "投稿"}・{stars(card.rarity)}・コスト {card.cost}
          </p>
          <h2>
            {!dark && card.epithet && <small>{card.epithet}</small>}
            {name}
            {dark && <small className="zs-dark">闇堕ちの姿</small>}
          </h2>
          <AttrChips card={card} />
          {card.type === "icon" && (
            <p className="zs-stats">
              攻撃力 <b className="t-atk">{view?.attack ?? (dark ? card.dark?.attack : card.attack)}</b>
              <span>・</span>
              体力 <b className="t-hp">{view ? view.hp : dark ? card.dark?.hp : card.hp}</b>
              {view && view.hp < view.maxHp && <span className="zs-max">／{view.maxHp}</span>}
            </p>
          )}
          {effect && (
            <p className="zs-effect">
              <EffectText text={effect} />
            </p>
          )}
          {keywords.length > 0 && (
            <dl className="zs-keywords">
              {keywords.map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{KEYWORD_HELP[k]}</dd>
                </div>
              ))}
            </dl>
          )}
          {view && (view.exposed || view.asleep || view.unit.silenced) && (
            <ul className="zs-states">
              {view.exposed && <li>晒し者：ガードを無視して攻撃される</li>}
              {view.asleep && <li>眠っている：このターンは攻撃できない</li>}
              {view.unit.silenced && <li>訂正済み：キーワードと効果が消えている</li>}
            </ul>
          )}
          {canPreview ? (
            <button type="button" className="btn ghost" onClick={() => setShowDark((v) => !v)}>
              {showDark ? "元の姿に戻す" : "闇堕ちの姿を見る"}
            </button>
          ) : (
            !view && card.dark && <p className="zs-note">闇堕ちの姿は、闇堕ちするまで分からない</p>
          )}
          <p className="zs-note">カードを押すと、文字を隠して絵だけを見られます</p>
          <button type="button" className="btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
