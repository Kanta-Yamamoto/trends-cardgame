import { useQuery } from "@tanstack/react-query";
import { ATTRIBUTES, type Attribute, CARDS, type CardDef } from "@trends/cards";
import { extraCopies } from "@trends/game-core";
import { useEffect, useState } from "react";
import { BUNDLED_CARDS, fetchCards } from "../api/client";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { useCollection } from "../gacha/collection";
import { CardZoom } from "../game/CardZoom";
import { useSession } from "../online/session";

/** 一覧に出すカード（同梱データにあるものだけ。API の DB に古い行が残っていても出さない） */
const LISTED = new Set(CARDS.map((c) => c.id));

type Filter = Attribute | "ニュートラル" | null;

/**
 * カード一覧。★5 から順に、★ごとのまとまりで 3 列に並べる（縦にスクロールするだけで全部見られる）。
 * 押すと拡大し、拡大したまま「前へ・次へ」で、絞り込んだ並びの前後のカードを順に見られる
 */
/** カードの絵（背景と切り抜き）を読み込み終えたか。初めて開いたときは絵が届くまで時間がかかる */
function useArtReady(card: CardDef) {
  const urls = [card.art, card.subject].filter((u): u is string => !!u);
  const key = urls.join("|");
  const [ready, setReady] = useState(urls.length === 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 絵の URL（key）が変わったときだけ読み直す
  useEffect(() => {
    if (!key) return setReady(true);
    let alive = true;
    let left = urls.length;
    const done = () => {
      left -= 1;
      if (left <= 0 && alive) setReady(true);
    };
    for (const u of urls) {
      const img = new Image();
      img.onload = done;
      img.onerror = done; // 読めなくても、いつまでも読み込み中にはしない
      img.src = u;
      if (img.complete) {
        img.onload = null;
        img.onerror = null;
        done();
      }
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return ready;
}

/**
 * 一覧の 1 枚。絵が届くまでは、カードの形の光る板（スケルトン）を出し、届いたらふわっと出す。
 * 持っていないカードは灰色、持っているカードは今までどおりで、下に枚数（10月27日。3 枚以上はダブりなので色を変える）。
 * owned が null のあいだ（持っているカードをまだ取れていない）は、どちらの印も出さない
 */
function GalleryItem({ card, owned, onOpen }: { card: CardDef; owned: number | null; onOpen: () => void }) {
  const ready = useArtReady(card);
  const missing = owned === 0;
  return (
    <div
      className={`g-item ${ready ? "ready" : "loading"} ${missing ? "unowned" : ""}`}
      aria-busy={!ready || undefined}
    >
      <HoloCard card={card} compact onClick={onOpen} />
      {/* 持っていないカードは枚数を出さず、行の高さだけそろえる */}
      {owned !== null && (
        <span className="g-own-row">
          {owned > 0 && <span className={`g-own ${extraCopies(owned) > 0 ? "extra" : ""}`}>×{owned}</span>}
        </span>
      )}
    </div>
  );
}

/** カード一覧を読み込んでいる間の、カードの形の光る板（★ごとの見出しと 3 列の並びをまねる） */
function GallerySkeleton() {
  return (
    <div aria-label="読み込み中" role="status">
      {[3, 6].map((n, i) => (
        <section key={n} className="g-row">
          <h2 className="g-row-head">
            <span className="g-skel-line" style={{ width: i === 0 ? 96 : 120 }} />
          </h2>
          <div className="gallery">
            {Array.from({ length: n }, (_, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 中身の無い板なので順番で十分
              <div key={k} className="g-item loading">
                <div className="g-skel-card" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Gallery() {
  // 同梱データをすぐ出し、サーバーの返事が来たら差し替える（起き上がり待ちで止まって見えないように）。
  // 失敗しても数回やり直し、それでもだめなときだけ知らせる
  const { data, isError, isLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
    placeholderData: BUNDLED_CARDS,
    retry: 3,
    retryDelay: (n) => 2000 * (n + 1),
  });
  const [filter, setFilter] = useState<Filter>(null);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const token = useSession((s) => s.token);
  const owned = useCollection((s) => s.cards);
  const loadOwned = useCollection((s) => s.load);
  useEffect(() => {
    void loadOwned(token);
  }, [token, loadOwned]);
  const countOf = (id: string) => (owned ? (owned[id] ?? 0) : null);

  // 同じ★の中は、属性ごと（ニュートラルは最後）に、コストの低い順
  const group = (c: CardDef) => (c.attributes[0] ? ATTRIBUTES.indexOf(c.attributes[0]) : ATTRIBUTES.length);
  const match = (c: CardDef) =>
    !filter || (filter === "ニュートラル" ? c.attributes.length === 0 : c.attributes.includes(filter));
  // やり直しても失敗したときは data が空になるので、同梱データを出し続ける
  const cards = (data ?? BUNDLED_CARDS)
    .filter((c) => !c.token && LISTED.has(c.id) && match(c))
    .sort(
      (a, b) => b.rarity - a.rarity || group(a) - group(b) || a.cost - b.cost || a.id.localeCompare(b.id),
    );
  const rows = [5, 4, 3, 2, 1]
    .map((r) => ({ rarity: r, cards: cards.filter((c) => c.rarity === r) }))
    .filter((r) => r.cards.length > 0);
  // 拡大で前後に移る順番は、画面に並んでいる順（★の高い順）
  const order = rows.flatMap((r) => r.cards);
  const zoomAt = zoomId ? order.findIndex((c) => c.id === zoomId) : -1;
  const zoom = zoomAt >= 0 ? order[zoomAt] : undefined;

  return (
    <section className="page gallery-page">
      {isError && (
        <p className="notice">サーバーにつながらないため、アプリに入っているカードデータを表示しています。</p>
      )}
      <div className="g-filters" role="toolbar" aria-label="属性で絞り込む">
        {([null, ...ATTRIBUTES, "ニュートラル"] as Filter[]).map((f) => (
          <button
            key={f ?? "all"}
            type="button"
            className={`g-chip ${f ? "" : "all"} ${filter === f ? "on" : ""}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "ニュートラル" ? (
              <span className="at neutral" aria-hidden="true">
                ニ
              </span>
            ) : f ? (
              <span className="at" style={{ background: ATTR_META[f].color }} aria-hidden="true">
                {ATTR_META[f].mark}
              </span>
            ) : null}
            {f ?? "すべて"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <GallerySkeleton />
      ) : (
        rows.map((row) => (
          <section key={row.rarity} className="g-row" aria-label={`★${row.rarity}`}>
            <h2 className="g-row-head">
              <span className="g-stars">{"★".repeat(row.rarity)}</span>
              <small>
                {owned
                  ? `持っている ${row.cards.filter((c) => (owned[c.id] ?? 0) > 0).length} / ${row.cards.length}種類`
                  : `${row.cards.length}枚`}
              </small>
            </h2>
            <div className="gallery">
              {row.cards.map((c) => (
                <GalleryItem key={c.id} card={c} owned={countOf(c.id)} onOpen={() => setZoomId(c.id)} />
              ))}
            </div>
          </section>
        ))
      )}
      {zoom && (
        <CardZoom
          key={zoom.id}
          card={zoom}
          darkPreview
          nav={{
            index: zoomAt + 1,
            total: order.length,
            prev: () => setZoomId(order[zoomAt - 1]?.id ?? zoom.id),
            next: () => setZoomId(order[zoomAt + 1]?.id ?? zoom.id),
          }}
          onClose={() => setZoomId(null)}
        />
      )}
    </section>
  );
}
