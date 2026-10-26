import type { CardDef } from "@trends/cards";
import { ATTR_META } from "../cards/meta";
import { CATALOG } from "./store";

/* デッキの絵（デッキ選び・デッキの確認・デッキ構築の一覧・対戦の始まりで共通） */

/** エースの切り抜き。専用のカード面を持つ★5は、カードデータに切り抜きの指定が無い（面の CSS が直接読む）ので、同じ名前の切り抜きを使う */
export function aceSubject(card: CardDef): string | undefined {
  return card.subject ?? (card.rarity === 5 ? card.art?.replace(/-art\.jpg$/, "-subject.webp") : undefined);
}

export function DeckAce({ id }: { id?: string }) {
  const card = id ? CATALOG[id] : undefined;
  if (!card?.art) return null;
  const subject = aceSubject(card);
  return (
    <span className="deck-ace" aria-hidden="true">
      <span className="deck-ace-bg" style={{ backgroundImage: `url(${card.art})` }} />
      {subject ? (
        <img
          className="deck-ace-subject"
          src={subject}
          alt=""
          loading="lazy"
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="deck-ace-shade" />
    </span>
  );
}

/** エースで決まるデッキの色。『フィクサー』（c15）は白から黒へ滲む二色、『演出家』（c17）は真紅と黒を斜線で分ける */
const ACE_GRADIENT: Record<string, string> = {
  c15: "linear-gradient(160deg, #f2f1ee 18%, #0e0d0c 82%)",
  // 『演出家』（c17）：真紅と黒の二色。斜線で分ける
  c17: "linear-gradient(160deg, #cf1b10 0 46%, #1c171c 46%)",
};

/** デッキの色（単属性なら左右とも同じ色） */
export function deckGradient(attrs: readonly string[], ace?: string) {
  if (ace && ACE_GRADIENT[ace]) return ACE_GRADIENT[ace];
  const [a, b = a] = attrs.map((x) => ATTR_META[x as keyof typeof ATTR_META]);
  if (!a) return "linear-gradient(125deg, #6b7280, #374151)";
  return `linear-gradient(125deg, ${a.color}, ${a.deep} 50%, ${b?.deep} 50%, ${b?.color})`;
}

/** デッキの属性の丸（属性の色はここだけ） */
export function AttrDots({ attrs }: { attrs: readonly string[] }) {
  if (attrs.length === 0)
    return (
      <span className="at neutral" title="ニュートラル">
        N
      </span>
    );
  return (
    <>
      {attrs.map((a) => {
        const m = ATTR_META[a as keyof typeof ATTR_META];
        return (
          <span key={a} className="at" style={{ background: m?.color }} title={a}>
            {m?.mark ?? a}
          </span>
        );
      })}
    </>
  );
}
