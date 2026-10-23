import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../kusahami.css";

/** クサハミ（★5）：大食い配信。コストはお皿、効果は「おかわり伝票」。枠のまわりに草のかけらが舞う */
export function KusahamiFace({ card }: { card: CardDef }) {
  // 闇堕ちの姿は名前が「毒草喰らいのクサハミ」になる。「〜の」を名前の上の小さい段に回す
  const split = card.name.match(/^(.+の)(クサハミ)$/);
  const head = split ? split[1] : "";
  const name = split ? split[2] : card.name;
  return (
    <div className="card-inner">
      <div className="layer meadow" />
      <div className="layer crumbs" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer sunbeam" />
        <div className="layer spores" />
      </div>
      <div className="layer rim" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          {head && <span className="epi">{head}</span>}
          <h3>{name}</h3>
        </div>
        <div className="slip">
          <div className="head">
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
