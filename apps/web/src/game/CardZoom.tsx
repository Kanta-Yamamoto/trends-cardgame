import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { useEffect, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { stars } from "../cards/meta";
import { HELP } from "../help/help";

/**
 * カードを画面いっぱいに大きく見せる（スマホで効果を読むため）。
 * 場のアイコンなら、今の攻撃力・体力・状態も添える。カードを押すと文字を隠して絵だけを見られる。
 * darkPreview のときは、闇堕ちを持つカードの「闇堕ちすると」の姿と効果を添え、絵も切り替えられる
 * （対戦中もカード一覧でも）。initialDark で最初から闇堕ちの姿で開く。
 */
export function CardZoom({
  card,
  view,
  darkPreview = false,
  initialDark = false,
  onClose,
}: {
  card: CardDef;
  view?: UnitView;
  darkPreview?: boolean;
  initialDark?: boolean;
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
              攻撃力 <b className="t-atk">{live?.attack ?? (dark ? card.dark?.attack : card.attack)}</b>
              <span>・</span>
              体力 <b className="t-hp">{live ? live.hp : dark ? card.dark?.hp : card.hp}</b>
              {live && live.hp < live.maxHp && <span className="zs-max">／{live.maxHp}</span>}
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
                  <dd>{HELP[k]?.text}</dd>
                </div>
              ))}
            </dl>
          )}
          {live &&
            (live.exposed ||
              live.unit.exposeAtTurnEnd ||
              !!live.unit.totonoi ||
              live.asleep ||
              live.unit.silenced) && (
              <ul className="zs-states">
                {live.exposed && <li>晒し者：ガードを失い、それまでの強化が消えた</li>}
                {live.unit.exposeAtTurnEnd && <li>炎上商法：このターンの終わりに晒し者になる</li>}
                {!!live.unit.totonoi && (
                  <li>整い：自分のターンの始めに体力を1回復する（あと{live.unit.totonoi}ターン）</li>
                )}
                {live.asleep && <li>眠っている：このターンは攻撃できない</li>}
                {live.unit.silenced && <li>訂正済み：キーワードと効果が消えている</li>}
              </ul>
            )}
          {canPreview && card.dark && !previewing && (
            <div className="zs-darkbox">
              <p className="zs-darkbox-head">
                闇堕ちすると <b>{card.dark.name}</b>
                <span className="zs-darkbox-stats">
                  <b className="t-atk">{card.dark.attack}</b>／<b className="t-hp">{card.dark.hp}</b>
                </span>
              </p>
              <p className="zs-darkbox-effect">
                <EffectText text={card.dark.effect} />
              </p>
              <p className="zs-note">
                オワコンに行ったら、自分のターンにコストなしでこの姿で出せる（1回だけ。そのターンは相手のアイコンにだけ攻撃できる）
              </p>
            </div>
          )}
          {canPreview && (
            <button type="button" className="btn ghost" onClick={() => setShowDark((v) => !v)}>
              {showDark ? "元の姿に戻す" : "闇堕ちの姿を見る"}
            </button>
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
