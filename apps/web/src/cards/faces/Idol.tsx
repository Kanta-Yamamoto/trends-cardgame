import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** トップアイドル（★5）：ピンクと白のステージ衣装のような、かわいいキラデザイン */
export function IdolFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer frame" />
      <div className="layer frame-iri" />
      <div className="layer frame-hearts" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer lights" />
        <div className="layer hearts" />
      </div>
      <div className="layer lace" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="ribbon">
          <h3>{card.name}</h3>
        </div>
        <div className="letter">
          <AttrChips card={card} />
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="stamp">♡ LIVE</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
