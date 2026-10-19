import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../fixer.css";

/**
 * 『フィクサー』（★5・共通）：白と黒と赤だけの、ほかの★5 と違う唯一のデザイン。
 * 絵の右半分のホログラム（グリッチ）に合わせて、カードも右半分だけが崩れ、虹色にちらつく。
 * 上から垂れる細い糸は「裏で糸を引く」。効果は極秘の指令書。
 */
export function FixerFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer fx-ink" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer fx-slice" />
        <div className="layer fx-holo" />
        <div className="layer fx-scan" />
      </div>
      <div className="layer fx-strings" />
      <div className="layer fx-edge-l" />
      <div className="layer fx-edge-r" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          {card.epithet && <span className="epi">{card.epithet}</span>}
          <h3 data-text={card.name}>{card.name}</h3>
        </div>
        <div className="order">
          <div className="head">
            <span className="stamp">極秘</span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="client">依頼人：不明</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
