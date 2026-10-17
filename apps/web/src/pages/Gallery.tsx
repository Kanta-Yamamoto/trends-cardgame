import { useQuery } from "@tanstack/react-query";
import type { CardDef } from "@trends/cards";
import { useState } from "react";
import { fetchCards } from "../api/client";
import { HoloCard } from "../cards/HoloCard";

export function Gallery() {
  const { data, isLoading } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const cards = data?.cards.filter((c) => !c.token) ?? [];
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [textHidden, setTextHidden] = useState(false);
  const open = (c: CardDef) => {
    setTextHidden(false);
    setZoom(c);
  };

  return (
    <section className="page">
      <header className="page-head">
        <h1>カード一覧</h1>
        <p className="muted">
          カードを押すと拡大して、効果を読めます。拡大したカードをもう一度押すと、文字を隠して絵だけを見られます。
        </p>
        {data?.fallback && (
          <p className="notice">API に接続できないため、アプリに同梱したカードデータを表示しています。</p>
        )}
      </header>
      {isLoading ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <div className="gallery">
          {cards.map((c) => (
            <HoloCard key={c.id} card={c} compact onClick={() => open(c)} />
          ))}
        </div>
      )}
      {zoom && (
        <div className="zoom" role="dialog" aria-modal="true" aria-label={zoom.name}>
          <button type="button" className="btn ghost close" onClick={() => setZoom(null)}>
            閉じる
          </button>
          <div className="zoom-card">
            <HoloCard card={zoom} textHidden={textHidden} onClick={() => setTextHidden((v) => !v)} />
          </div>
          <p className="zoom-hint">
            {textHidden ? "カードを押すと文字を戻します" : "カードを押すと文字を隠して絵だけを見られます"}
          </p>
        </div>
      )}
    </section>
  );
}
