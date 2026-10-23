import type { CardDef } from "@trends/cards";
import { ATTR_META } from "./meta";

/** 属性（色とマーク）と種族のラベル */
export function AttrChips({ card, kaiwai = true }: { card: CardDef; kaiwai?: boolean }) {
  return (
    <span className="chips">
      {card.attributes.length === 0 && <span className="chip common">ニュートラル</span>}
      {card.attributes.map((a) => (
        <span
          key={a}
          className="chip attr"
          style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}
        >
          {a}
        </span>
      ))}
      {kaiwai &&
        card.kaiwai.map((k) => (
          <span key={k} className="chip kaiwai">
            {k}種族
          </span>
        ))}
    </span>
  );
}
