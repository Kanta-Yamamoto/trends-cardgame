import type { Attribute } from "@trends/cards";
import { type CSSProperties, useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { CATALOG } from "../game/store";
import { type Face, faceUrl } from "./Guide";
import { Rich } from "./Rich";

interface AttrLine {
  attr: Attribute;
  /** 見せる★5 */
  card: string;
  face: Face;
  text: string;
}

/**
 * 属性ごとに見せるカードとひとこと（11月1日。Claude の案）。勝ち方の癖は docs/rules.md「属性」を短くしたもの。
 * 水はミナモ自身のカード
 */
const ATTRS: readonly AttrLine[] = [
  { attr: "炎", card: "c4", face: "point", text: "**炎**：燃やして、速攻で一気に削る！" },
  { attr: "推し", card: "m1", face: "cheer", text: "**推し**：推しを育てて、後半に押し切る！" },
  { attr: "水", card: "c3", face: "shy", text: "**水**：回復して、ねばって勝つ。わたしもここ！" },
  { attr: "自然", card: "c8", face: "open", text: "**自然**：草を生やして、数で押す！" },
  { attr: "神", card: "g20", face: "think", text: "**神**：守りを固めて、確実に破壊する！" },
];

/**
 * 勝ったあとの、属性の紹介（11月1日。オーナー：「属性、このカードのコンセプトを説明したい」）。
 * 5 つの属性の丸を押すと、その属性の★5 が出て、ちびミナモがひとことで勝ち方を言う。全部見たら、デッキの組み方を言ってガチャの案内へ。
 * 対戦の前ではなく勝ったあとに置いたのは、早く遊び始められるようにするのと、このあとのガチャ（カードを集める）につなげるため（Claude の案）
 */
export function AttrTour({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  const all = seen.size === ATTRS.length;
  const cur = pick === null ? null : ATTRS[pick];
  const card = cur ? CATALOG[cur.card] : undefined;
  const meta = cur ? ATTR_META[cur.attr] : undefined;

  const choose = (i: number) => {
    setPick(i);
    setSeen((s) => new Set(s).add(i));
  };

  const text = cur ? cur.text : "カードには**5つの属性**があるよ。押してみて！";
  return (
    <div
      className="tut-intro tut-attrs tut-ui ph-talk sc-kira"
      role="dialog"
      aria-modal="true"
      aria-label="属性の紹介"
      style={meta ? ({ "--ac": meta.color, "--ad": meta.deep } as CSSProperties) : undefined}
    >
      <span className="ti-rays" aria-hidden="true" />
      <span className="ta-tint" aria-hidden="true" />
      <div className="ta-stage">
        {card ? (
          <div key={card.id} className="ta-card">
            <span className="ti-kira-glow" aria-hidden="true" />
            <HoloCard card={card} interactive />
          </div>
        ) : (
          <div className="ta-backs" aria-hidden="true">
            {ATTRS.map((a, i) => (
              <span
                key={a.attr}
                className="ta-back"
                style={{ "--k": i - 2, "--c": ATTR_META[a.attr].color } as CSSProperties}
              >
                {ATTR_META[a.attr].mark}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="ta-row">
        {ATTRS.map((a, i) => (
          <button
            key={a.attr}
            type="button"
            className={`ta-attr${pick === i ? " on" : ""}${seen.has(i) ? " seen" : ""}`}
            style={
              { "--c": ATTR_META[a.attr].color, "--d": ATTR_META[a.attr].deep, "--i": i } as CSSProperties
            }
            onClick={() => choose(i)}
            aria-pressed={pick === i}
          >
            <b>{a.attr}</b>
          </button>
        ))}
      </div>
      <div className="ti-chibi" aria-hidden="true">
        <img key={cur?.face ?? "open"} src={faceUrl(cur?.face ?? "open")} alt="" draggable={false} />
      </div>
      <div className="ti-talk g3" aria-live="polite">
        <b className="tut-who">ミナモ</b>
        <p key={text}>
          <Rich text={text} />
        </p>
        {all && (
          <p key="deck" className="ta-deck">
            <Rich text="デッキは**属性1つ**＋**ニュートラル**で組むよ。" />
          </p>
        )}
        <div className="tut-acts">
          {all && (
            <button type="button" className="btn" onClick={onNext}>
              つぎへ
            </button>
          )}
        </div>
      </div>
      <button type="button" className="tut-skip btn ghost small" onClick={onSkip}>
        スキップ
      </button>
    </div>
  );
}
