import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";
import "../arbiter.css";

/** 名前・効果・数値の板。斬り口の上と下で 2 回描く */
function Plate({ card }: { card: CardDef }) {
  return (
    <>
      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <div className="plate">
        <div className="name">
          <h3>{card.name}</h3>
        </div>
        <div className="box">
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <AttrChips card={card} />
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 『調停者』（★5・共通）：紺・群青・白だけのデザイン。『フィクサー』（白・黒・赤）と対になる運営サイド。
 * 触れるカード（拡大・手札）が出たとき、一太刀で斬られてずれた名前と効果欄が、ぴたりと合わさって元に戻る。
 * 最後は線もずれも残らない（読みやすさを優先）。
 */
export function ArbiterFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer bg" />
      <div className="layer subject" />
      <div className="layer shade" />
      <div className="layer cut cut-top" aria-hidden="true">
        <Plate card={card} />
      </div>
      <div className="layer cut cut-bot">
        <Plate card={card} />
      </div>
      <svg className="layer slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line className="draw" x1="-4" y1="73.6" x2="104" y2="57.4" vectorEffect="non-scaling-stroke" />
        <line className="glow" x1="-4" y1="73.6" x2="104" y2="57.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="shard s1" />
      <i className="shard s2" />
      <i className="shard s3" />
      <i className="shard s4" />
      <div className="layer frame" />
      <div className="layer glare" />
    </div>
  );
}
