import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ルリ（★5）：夜勤の病室。星空の枠に月明かり、効果は夜勤のカルテ。足もとに心電図の線 */
export function RuriFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer night" />
      <div className="layer lace" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer moonlight" />
        <div className="layer sparkle" />
      </div>
      <div className="layer rim" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="chart">
          <div className="head">
            <span className="label">夜勤カルテ</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && (
            <p className="dark-note">闇堕ち：オワコンから1回だけ、コストなしで闇堕ちして戻ってくる</p>
          )}
          <div className="foot">
            <svg className="vital" viewBox="0 0 120 20" aria-hidden="true" preserveAspectRatio="none">
              <polyline
                points="0,12 18,12 24,12 28,4 32,18 36,12 60,12 66,12 70,2 74,19 78,12 100,12 120,12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
