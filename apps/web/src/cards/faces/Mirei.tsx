import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ミレイ（★5）：ドームの客席。マゼンタの枠にペンライトの海、効果はセットリスト（ラスサビの曲目）。コストはドームの座席番号風 */
export function MireiFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer dome" />
      <div className="layer seats" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer beams" />
        <div className="layer penlights" />
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
        <div className="setlist">
          <div className="head">
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
