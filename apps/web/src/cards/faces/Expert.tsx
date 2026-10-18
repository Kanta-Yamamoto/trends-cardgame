import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** 専門家（★5）：象牙と金の学術書のようなデザイン。効果は論文の「所見」として書く */
export function ExpertFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer ivory" />
      <div className="layer engrave" />
      <div className="layer gold-frame" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer diagram" />
        <div className="layer dust" />
      </div>
      <div className="layer arch" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="title">
          <h3>{card.name}</h3>
          <span className="rule" aria-hidden="true">
            ✦
          </span>
        </div>
        <div className="paper">
          <div className="head">
            <span>所見</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && <p className="dark-note">推し：倒されたあと1回だけ、闇堕ちして戻ってくる</p>}
          <div className="foot">
            <span className="seal" aria-hidden="true">
              ✦
            </span>
            <span className="cite">※ 査読済み</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
