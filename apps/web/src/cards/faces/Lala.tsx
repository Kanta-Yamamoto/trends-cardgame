import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ララ（★5）：配信画面。黄緑の枠に流れる「w」、効果はリプ欄のいちばん上のコメント。コストは同接の人数風 */
export function LalaFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer stream" />
      <div className="layer kusa-flow" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer sunbeam" />
        <div className="layer leaves" />
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
          <h3>{card.name}</h3>
        </div>
        <div className="reply">
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
