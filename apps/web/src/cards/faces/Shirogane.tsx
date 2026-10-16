import type { CardDef } from "@trends/cards";
import { cardNo, EffectText } from "../EffectText";
import { Stats } from "../Stats";

/** プロトタイプ（legacy/prototype-src）のカードデザインを React に移したもの */
export function ShiroganeFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer bg"></div>
      <div className="layer bg-holo"></div>
      <div className="layer glitter"></div>
      <div className="layer frame-holo"></div>
      <div className="layer inner-line"></div>
      <div className="layer subject"></div>
      <div className="layer subject-holo"></div>

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{card.rarity}</div>

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="box">
          <span className="tribe">{card.tribe}</span>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <p className="flavor">{card.flavor}</p>
          <div className="foot">
            <span className="no">{cardNo(card)}</span>
            <Stats card={card} />
          </div>
        </div>
      </div>
      <div className="layer glare"></div>
    </div>
  );
}
