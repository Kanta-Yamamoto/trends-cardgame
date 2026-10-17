import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { attrBackground, stars, typeLabel } from "../meta";
import { Stats } from "../Stats";

/** イラストがまだないカード用の共通デザイン（属性の色で描く） */
export function GenericFace({ card }: { card: CardDef }) {
  return (
    <div className={`card-inner kg-${card.type}`}>
      <div className="layer kg-bg" style={{ background: attrBackground(card) }} />
      <div className="layer kg-sheen" />
      <div className="kg-cost">
        <b>{card.cost}</b>
      </div>
      <div className="kg-rarity" title={`★${card.rarity}`}>
        {stars(card.rarity)}
      </div>
      <div className="kg-mark" aria-hidden="true">
        {card.name.slice(0, 1)}
      </div>
      {card.dark && <div className="kg-dark">闇堕ち</div>}
      <div className="kg-plate">
        <span className="kg-type">{typeLabel(card)}</span>
        {card.epithet && <span className="kg-epi">{card.epithet}</span>}
        <h3 className="kg-name">{card.name}</h3>
        <AttrChips card={card} />
        <p className="kg-effect">{card.effect ? <EffectText text={card.effect} /> : <i>効果なし</i>}</p>
        {card.dark && (
          <p className="kg-darktext">
            闇堕ち：一度倒されたとき、裏返って「{card.dark.name}」になる（姿は裏返るまで秘密）
          </p>
        )}
        <p className="kg-flavor">{card.flavor}</p>
        {card.type === "icon" && (
          <span className="kg-power">
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </span>
        )}
      </div>
    </div>
  );
}
