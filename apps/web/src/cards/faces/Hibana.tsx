import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** ヒバナ（★5）：燃えるステージ。効果はテレビの「速報」テロップ */
export function HibanaFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer lacquer" />
      <div className="layer embers" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer heat" />
        <div className="layer sparks" />
      </div>
      <div className="layer flames" />
      <div className="layer edge" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>

      <div className="plate">
        <div className="name">
          <h3>{card.name}</h3>
        </div>
        <div className="ticker">
          <div className="ticker-head">
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
