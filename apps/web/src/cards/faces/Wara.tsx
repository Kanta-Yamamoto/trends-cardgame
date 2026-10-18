import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../rare5b.css";

/** ワラ（★5）：大草原と流れるコメント。効果は「www」が付いたコメントの吹き出し */
export function WaraFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer meadow" />
      <div className="layer danmaku" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer flow" />
        <div className="layer petals" />
      </div>
      <div className="layer rim" />
      <div className="layer subject" />
      <div className="layer subject-shine" />
      <div className="layer grass" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      {card.dark && <div className="dark-tag">闇堕ち</div>}

      <div className="plate">
        <div className="name">
          <h3>{card.name}</h3>
          <span className="www" aria-hidden="true">
            www
          </span>
          <span className="epi">{card.epithet}</span>
        </div>
        <div className="bubble">
          <div className="head">
            <span className="label">
              <i aria-hidden="true" />
              コメント
            </span>
            <AttrChips card={card} />
          </div>
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && <p className="dark-note">闇堕ち：一度倒されたとき、裏返って別の姿になる</p>}
          <div className="foot">
            <span className="react">♥ 草 9,999+</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
