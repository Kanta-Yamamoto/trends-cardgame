import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** アイリ（★5）：ローズゴールドとティアラ。効果はライブの「チケット」（もぎり付き） */
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
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="ticket">
          <div className="stub" aria-hidden="true">
            <span>ARENA</span>
            <b>A-01</b>
          </div>
          <div className="main">
            <div className="head">
              <span className="label">LIVE TICKET</span>
              <AttrChips card={card} />
            </div>
            <p className="effect">
              <EffectText text={card.effect} />
            </p>
            {card.dark && <p className="dark-note">推し：倒されたあと1回だけ、闇堕ちして戻ってくる</p>}
            <div className="foot">
              <span className="admit">♛ 全公演 最前列</span>
              <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
            </div>
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
