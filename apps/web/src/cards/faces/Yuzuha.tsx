import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ユズハ（★5）：檜の板と湯けむり。コストは温度計、効果はサウナの「ととのい札」 */
export function YuzuhaFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer hinoki" />
      <div className="layer grain" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer steam" />
        <div className="layer drops" />
      </div>
      <div className="layer rim" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
        <small>℃</small>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="board">
          <div className="head">
            <span className="label">ととのい札</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && <p className="dark-note">闇堕ち：一度倒されたとき、裏返って別の姿になる</p>}
          <div className="foot">
            <span className="timer" aria-hidden="true">
              <i />
              12:00
            </span>
            <span className="temps">サ室 100℃ ／ 水風呂 16℃</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
