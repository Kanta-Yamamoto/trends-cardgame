import type { CardDef } from "@trends/cards";
import type { CSSProperties } from "react";
import { AttrChips } from "../AttrChips";
import { EffectText } from "../EffectText";
import { ATTR_META, stars, typeLabel } from "../meta";
import { Stats } from "../Stats";

/**
 * ★4〜5 の共通キラデザイン。色は属性から、絵はカードの art / subject から取る。
 * ★5 は枠の箔・ラメ・名前の箔押しが加わる。
 */
export function RareFace({ card }: { card: CardDef }) {
  const [a, b] = card.attributes.map((x) => ATTR_META[x]);
  const main = a ?? ATTR_META.神;
  const sub = b ?? main;
  const vars = {
    "--c": main.color,
    "--c-deep": main.deep,
    "--c2": sub.color,
    "--c2-deep": sub.deep,
    "--art": card.art ? `url(${card.art})` : "none",
    "--subject": card.subject ? `url(${card.subject})` : "none",
  } as CSSProperties;

  return (
    <div className={`card-inner kr-${card.rarity >= 5 ? "ssr" : "sr"} kr-${card.type}`} style={vars}>
      <div className="layer kr-base" />
      <div className="layer kr-win">
        <div className="layer kr-art" />
        <div className="layer kr-holo" />
        <div className="layer kr-glitter" />
      </div>
      <div className="layer kr-frame" />
      <div className="layer kr-line" />
      {card.subject && (
        <>
          <div className="layer kr-subject" />
          <div className="layer kr-subject-holo" />
        </>
      )}

      <div className="kr-cost">
        <b>{card.cost}</b>
      </div>
      <div className="kr-rarity" title={`★${card.rarity}`}>
        {stars(card.rarity)}
      </div>
      {card.dark && <div className="kr-dark">闇堕ち</div>}

      <div className="kr-plate">
        <div className="kr-name">
          <span className="kr-type">{typeLabel(card)}</span>
          {card.epithet && <span className="kr-epi">{card.epithet}</span>}
          <h3>{card.name}</h3>
        </div>
        <div className="kr-box">
          <AttrChips card={card} />
          <p className="kr-effect">
            <EffectText text={card.effect} />
          </p>
          {card.dark && (
            <p className="kr-darktext">
              推し：倒されたあと1回だけ、闇堕ちしてオワコンから戻ってくる（姿は闇堕ちするまで秘密）
            </p>
          )}
          {card.type === "icon" && (
            <span className="kr-power">
              <Stats attack={card.attack ?? 0} hp={card.hp ?? 0} />
            </span>
          )}
        </div>
      </div>
      <div className="layer kr-glare" />
    </div>
  );
}
