import type { CardDef } from "@trends/cards";
import type { CSSProperties } from "react";
import { cardNo, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** プロトタイプ（legacy/prototype-src）のカードデザインを React に移したもの */
export function MinamoFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer frame"></div>
      <div className="layer frame-iri"></div>
      <div className="layer frame-stars"></div>

      <div className="layer win">
        <div className="layer bg"></div>
        <div className="layer ripple"></div>
        <div className="layer art-stars"></div>
        <div className="layer bubbles">
          <i
            style={{ "--x": "8%", "--s": "11%", "--d": "9s", "--dl": "-2s", "--sw": "18" } as CSSProperties}
          ></i>
          <i
            style={{ "--x": "26%", "--s": "6%", "--d": "7s", "--dl": "-5s", "--sw": "-12" } as CSSProperties}
          ></i>
          <i
            style={{ "--x": "44%", "--s": "9%", "--d": "11s", "--dl": "-8s", "--sw": "14" } as CSSProperties}
          ></i>
          <i
            style={
              { "--x": "63%", "--s": "5%", "--d": "6.5s", "--dl": "-1s", "--sw": "-10" } as CSSProperties
            }
          ></i>
          <i
            style={
              { "--x": "78%", "--s": "12%", "--d": "10s", "--dl": "-6s", "--sw": "-16" } as CSSProperties
            }
          ></i>
          <i
            style={{ "--x": "90%", "--s": "7%", "--d": "8s", "--dl": "-3.5s", "--sw": "10" } as CSSProperties}
          ></i>
        </div>
      </div>
      <div className="layer inner-line"></div>
      <div className="layer subject"></div>
      <div className="layer subject-shine"></div>

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>

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
