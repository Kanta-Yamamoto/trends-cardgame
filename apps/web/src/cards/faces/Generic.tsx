import type { CardDef } from "@trends/cards";
import { EffectText } from "../EffectText";
import { Stats } from "../Stats";

/** イラストがまだないカード用の共通デザイン（テーマ色だけで描く） */
export function GenericFace({ card }: { card: CardDef }) {
  return (
    <div className={`card-inner kg-${card.theme}`}>
      <div className="layer kg-bg" />
      <div className="layer kg-sheen" />
      <div className="kg-cost">
        <b>{card.cost}</b>
      </div>
      <div className="kg-rarity">{card.rarity}</div>
      <div className="kg-mark" aria-hidden="true">
        {card.name.slice(0, 1)}
      </div>
      <div className="kg-plate">
        <span className="kg-epi">{card.epithet}</span>
        <h3 className="kg-name">{card.name}</h3>
        <span className="kg-tribe">{card.tribe}</span>
        <p className="kg-effect">{card.effect ? <EffectText text={card.effect} /> : <i>効果なし</i>}</p>
        <p className="kg-flavor">{card.flavor}</p>
        <span className="kg-power">
          <Stats card={card} />
        </span>
      </div>
    </div>
  );
}
