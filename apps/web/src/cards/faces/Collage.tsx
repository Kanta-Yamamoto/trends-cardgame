import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** 伝説のコラ画像（★5）：新聞の切り抜き・マスキングテープ・脅迫状風の文字でつくるコラージュ */
export function CollageFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer paper" />
      <div className="layer columns" />
      <div className="layer neon" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer glitch" />
        <div className="layer shards" />
      </div>
      <div className="layer subject" />
      <div className="layer subject-shine" />
      <i className="tape tape-a" aria-hidden="true" />
      <i className="tape tape-b" aria-hidden="true" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>

      <div className="plate">
        <h3 className="ransom" aria-label={card.name}>
          {[...card.name].map((ch, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 1文字ずつ切り抜きにするので位置が意味を持つ
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          ))}
        </h3>
        <div className="scrap">
          <i className="tape tape-c" aria-hidden="true" />
          <AttrChips card={card} />
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="src">出典：不明 / 保存数 10万</span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
