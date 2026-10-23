import type { CardDef } from "@trends/cards";
import { cardNo, DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
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
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="box">
          <span className="tribe">
            {[...card.attributes, ...card.kaiwai.map((k) => `${k}種族`)].join("・")}
          </span>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="no">{cardNo(card)}</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare"></div>
    </div>
  );
}
