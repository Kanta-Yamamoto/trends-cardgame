import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** アイリ（★5）：ラベンダーとシャンパンゴールドのティアラ（メロいのピンクと被らないように）。効果はライブの「チケット」（もぎり付き） */
export function AiriFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer satin" />
      <div className="layer sequins" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer spot" />
        <div className="layer confetti" />
      </div>
      <div className="layer pearl" />
      <div className="layer subject" />
      <div className="layer subject-shine" />
      <div className="layer tiara" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <h3>{card.name}</h3>
        </div>
        <div className="ticket">
          <div className="stub" aria-hidden="true" />
          <div className="main">
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
      </div>
      <div className="layer glare" />
    </div>
  );
}
