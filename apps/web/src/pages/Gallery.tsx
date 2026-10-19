import { useQuery } from "@tanstack/react-query";
import { ATTRIBUTES, type Attribute, CARDS, type CardDef } from "@trends/cards";
import { useState } from "react";
import { fetchCards } from "../api/client";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { CardZoom } from "../game/CardZoom";

/** お蔵入りのカード（同梱データの印で見る。API の DB には印の列が無い） */
const RETIRED = new Set(CARDS.filter((c) => c.retired).map((c) => c.id));

type Filter = Attribute | "共通" | null;

const RARITY_LABEL: Record<number, string> = {
  5: "切り札",
  4: "キラ",
  3: "レア",
  2: "アンコモン",
  1: "コモン",
};

/**
 * カード一覧。★5 から順に、★ごとの段に並べる。
 * スマホの縦持ちでは、段ごとに横へスワイプして見る（1枚が大きく、縦に長くならない）
 */
export function Gallery() {
  const { data, isLoading } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const [filter, setFilter] = useState<Filter>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);

  // 同じ★の中は、属性ごと（共通は最後）に、コストの低い順
  const group = (c: CardDef) => (c.attributes[0] ? ATTRIBUTES.indexOf(c.attributes[0]) : ATTRIBUTES.length);
  const match = (c: CardDef) =>
    !filter || (filter === "共通" ? c.attributes.length === 0 : c.attributes.includes(filter));
  const cards = (data?.cards.filter((c) => !c.token && !RETIRED.has(c.id) && match(c)) ?? [])
    .slice()
    .sort(
      (a, b) => b.rarity - a.rarity || group(a) - group(b) || a.cost - b.cost || a.id.localeCompare(b.id),
    );
  const rows = [5, 4, 3, 2, 1]
    .map((r) => ({ rarity: r, cards: cards.filter((c) => c.rarity === r) }))
    .filter((r) => r.cards.length > 0);

  return (
    <section className="page">
      <header className="page-head">
        <h1>カード一覧</h1>
        <p className="muted">
          カードを押すと拡大して、効果を大きな文字で読めます。スマホの縦持ちでは、段ごとに横へスワイプして見られます。
        </p>
        {data?.fallback && (
          <p className="notice">API に接続できないため、アプリに同梱したカードデータを表示しています。</p>
        )}
      </header>
      <div className="g-filters" role="toolbar" aria-label="属性で絞り込む">
        {([null, ...ATTRIBUTES, "共通"] as Filter[]).map((f) => (
          <button
            key={f ?? "all"}
            type="button"
            className={`g-chip ${filter === f ? "on" : ""}`}
            style={
              f && f !== "共通"
                ? {
                    borderColor: ATTR_META[f].color,
                    color: filter === f ? "#fff" : ATTR_META[f].color,
                    background: filter === f ? ATTR_META[f].deep : undefined,
                  }
                : undefined
            }
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f ?? "すべて"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="muted">読み込み中…</p>
      ) : (
        rows.map((row) => (
          <section key={row.rarity} className="g-row" aria-label={`★${row.rarity}`}>
            <h2 className="g-row-head">
              <span className="g-stars">{"★".repeat(row.rarity)}</span>
              {RARITY_LABEL[row.rarity]}
              <small>{row.cards.length}枚</small>
              <span className="g-swipe" aria-hidden="true">
                スワイプ →
              </span>
            </h2>
            <div className="gallery">
              {row.cards.map((c) => (
                <div key={c.id} className="g-item">
                  <HoloCard card={c} compact onClick={() => setZoom(c)} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
      {zoom && <CardZoom key={zoom.id} card={zoom} darkPreview onClose={() => setZoom(null)} />}
    </section>
  );
}
