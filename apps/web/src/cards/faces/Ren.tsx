import type { CardDef } from "@trends/cards";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

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
      <div className="rarity">{stars(card.rarity)}</div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3 className="foil">{card.name}</h3>
        </div>
        <div className="box">
          <span className="tribe">
            {[...card.attributes, ...card.kaiwai.map((k) => `${k}界隈`)].join("・")}
          </span>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && <p className="dark-note">推し：倒されたあと1回だけ、闇堕ちして戻ってくる</p>}
          <div className="foot">
            <span className="serial">
              SERIAL<b>{card.serial}</b>
            </span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare"></div>
    </div>
  );
}
