import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ヨミ（★5）：紺の革表紙と金の箔押し、しおりの紐。効果は古書の1ページ */
export function YomiFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer leather" />
      <div className="layer tooling" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer runes" />
        <div className="layer motes" />
      </div>
      <div className="layer gilt" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="bookmark">
        <span>{stars(card.rarity)}</span>
      </div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="page">
          <div className="head">
            <span className="label">― 蔵書 第七巻 ―</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && (
            <p className="dark-note">闇堕ち：オワコンから1回だけ、コストなしで闇堕ちして戻ってくる</p>
          )}
          <div className="foot">
            <span className="folio">p. 777</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
