import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
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
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="contract">
          <div className="head">
            <span className="label">依頼状</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && <p className="dark-note">推し：倒されたあと1回だけ、闇堕ちして戻ってくる</p>}
          <div className="foot">
            <span className="hanko" aria-hidden="true">
              請
            </span>
            <span className="memo">報酬：話題ひとつ</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
