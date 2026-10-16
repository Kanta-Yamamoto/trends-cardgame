import type { CardDef } from "@trends/cards";
import { EffectText } from "../EffectText";

/** プロトタイプ（legacy/prototype-src）のカードデザインを React に移したもの */
export function RenFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer frame"></div>
      <div className="layer emboss-lo"></div>
      <div className="layer emboss-hi"></div>
      <div className="layer emboss-face"></div>
      <div className="layer frame-red"></div>

      <div className="layer win">
        <div className="layer bg"></div>
        <div className="layer speed"></div>
        <div className="layer sparks"></div>
      </div>
      <div className="layer inner-line"></div>
      <div className="layer subject"></div>
      <div className="layer subject-shine"></div>

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{card.rarity}</div>

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3 className="foil">{card.name}</h3>
        </div>
        <div className="box">
          <span className="tribe">{card.tribe}</span>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <p className="flavor">{card.flavor}</p>
          <div className="foot">
            <span className="serial">
              SERIAL<b>{card.serial}</b>
            </span>
            <span className="power">
              <small>POWER</small>
              <b className="foil">{card.power}</b>
            </span>
          </div>
        </div>
      </div>
      <div className="layer glare"></div>
    </div>
  );
}
