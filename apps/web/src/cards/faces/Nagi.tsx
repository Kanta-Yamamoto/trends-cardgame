import type { CardDef } from "@trends/cards";
import { AttrChips } from "../AttrChips";
import { DarkTag, EffectText } from "../EffectText";
import { stars } from "../meta";
import { Stats } from "../Stats";

/** 音の波形の棒の高さ（%） */
const WAVE = Array.from({ length: 28 }, (_, i) => ({
  id: `w${i}`,
  h: 20 + Math.round(Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)) * 80),
}));

/** ナギ（★5）：水の中のような静けさ。効果は音声プレイヤーの画面 */
export function NagiFace({ card }: { card: CardDef }) {
  return (
    <div className="card-inner">
      <div className="layer glass" />
      <div className="layer wave-lines" />
      <div className="layer win">
        <div className="layer bg" />
        <div className="layer caustics" />
        <div className="layer bubbles-soft" />
      </div>
      <div className="layer rim" />
      <div className="layer subject" />
      <div className="layer subject-shine" />

      <div className="cost">
        <b>{card.cost}</b>
      </div>
      <div className="rarity">{stars(card.rarity)}</div>
      <DarkTag card={card} />

      <div className="plate">
        <div className="name">
          <span className="epi">{card.epithet}</span>
          <h3>{card.name}</h3>
        </div>
        <div className="player">
          <div className="wave" aria-hidden="true">
            {WAVE.map((w) => (
              <i key={w.id} style={{ height: `${w.h}%` }} />
            ))}
          </div>
          <AttrChips card={card} />
          <p className="effect">
            <EffectText text={card.effect} />
          </p>
          <div className="foot">
            <span className="seek" aria-hidden="true">
              <span className="bar" />
              <span className="time">0:42 / ∞</span>
            </span>
            <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
          </div>
        </div>
      </div>
      <div className="layer glare" />
    </div>
  );
}
