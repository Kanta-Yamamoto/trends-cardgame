import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { attrBackground, stars, typeLabel } from "../meta";
import { Stats } from "../Stats";

/** メイン以外のカードの共通デザイン。イラストがあれば全面に敷き、無ければ属性の色で描く */
export function GenericFace({ card }: { card: CardDef }) {
  return (
    <div className={`card-inner kg-${card.type} ${card.art ? "has-art" : ""}`}>
      <div className="layer kg-bg" style={{ background: attrBackground(card) }} />
      {card.art && <div className="layer kg-art" style={{ backgroundImage: `url(${card.art})` }} />}
      <div className="layer kg-sheen" />
      <div className="layer kg-frame" style={{ borderImageSource: attrBackground(card) }} />
      <div className="kg-cost">
        <b>{card.cost}</b>
      </div>
      <div className="kg-rarity" title={`★${card.rarity}`}>
        {stars(card.rarity)}
      </div>
      <DarkTag card={card} className="kg-dark" />
      <div className="kg-plate">
        <span className="kg-type">{typeLabel(card)}</span>
        <h3 className="kg-name">{card.name}</h3>
        <AttrChips card={card} />
        <p className="kg-effect">{card.effect && <EffectText text={card.effect} />}</p>
        {card.type === "icon" && (
          <span className="kg-power">
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </span>
        )}
      </div>
    </div>
  );
}
