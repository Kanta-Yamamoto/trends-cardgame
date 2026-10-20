import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../kusahami.css";

/** クサハミ（★5）：大食い配信。コストはお皿、効果は「おかわり伝票」。枠のまわりに草のかけらが舞う */
export function KusahamiFace({ card }: { card: CardDef }) {
  // 闇堕ちの姿は名前が「毒草喰らいのクサハミ」になる。「〜の」を二つ名の段に回して、通常の姿と同じ並びにする
  const split = card.name.match(/^(.+の)(クサハミ)$/);
  const epithet = split ? split[1] : card.epithet;
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
      <div className="layer mukbang" aria-hidden="true">
        もぐもぐ
      </div>

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <span className="epi">{epithet}</span>
          <h3>{name}</h3>
        </div>
        <div className="slip">
          <div className="head">
            <span className="label">おかわり伝票</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="tally" aria-hidden="true">
              正正正正
            </span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
