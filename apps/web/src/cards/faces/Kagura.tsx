import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** カグラ（★5）：黒漆と金の蒔絵、朱の焔。効果は朱の判を押した「依頼状」 */
export function KaguraFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer lacquer" />
      <div className="layer makie" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer haze" />
        <div className="layer sparks" />
      </div>
      <div className="layer edge" />
      <div className="layer corners" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <h3>{card.name}</h3>
        </div>
        <div className="contract">
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
