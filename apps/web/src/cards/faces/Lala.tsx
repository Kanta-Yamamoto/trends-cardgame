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
      <div className="layer live" aria-hidden="true">
        <i />
        LIVE
      </div>

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="reply">
          <div className="head">
            <span className="label">
              <i aria-hidden="true" />
              リプ欄
            </span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="react">wwwwwwww ↑ 99,999</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
