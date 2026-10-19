import {
  ATTRIBUTES,
  type Attribute,
  CARDS,
  type CardDef,
  DECK_SIZE,
  type DeckId,
  MAX_COPIES,
  MAX_DECK_ATTRIBUTES,
} from "@trends/cards";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { ATTR_META } from "../cards/meta";
import { CardZoom } from "../game/CardZoom";
import {
  attrsOf,
  builtinDeck,
  type CustomDeck,
  costCurve,
  deckErrors,
  loadCustomDecks,
  newDeckId,
  saveCustomDecks,
} from "../game/decks";
import { DECK_INFO } from "../game/store";

type Filter = Attribute | "共通" | "全部";
const FILTERS: Filter[] = ["全部", ...ATTRIBUTES, "共通"];
const COST_LABELS = ["1", "2", "3", "4", "5", "6", "7+"];
/** デッキに入れられるカード（トークンは除く）。属性→コスト→★の順 */
const POOL: CardDef[] = CARDS.filter((c) => !c.token && !c.retired).sort(
  (a, b) =>
    attrIndex(a) - attrIndex(b) ||
    a.cost - b.cost ||
    a.rarity - b.rarity ||
    a.name.localeCompare(b.name, "ja"),
);
function attrIndex(c: CardDef) {
  return c.attributes[0] ? ATTRIBUTES.indexOf(c.attributes[0]) : ATTRIBUTES.length;
}
const expand = (counts: Map<string, number>) =>
  [...counts].flatMap(([id, n]) => Array.from({ length: n }, () => id));
const countsOf = (cards: readonly string[]) => {
  const m = new Map<string, number>();
  for (const id of cards) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

/** デッキ構築：自分で 30 枚を組んで、この端末に保存する */
export function Decks() {
  const [list, setList] = useState<CustomDeck[]>(() => loadCustomDecks());
  const [editing, setEditing] = useState<CustomDeck | null>(null);
  const [copyFrom, setCopyFrom] = useState<DeckId | "">("");
  const [notice, setNotice] = useState<string | null>(null);

  const persist = (next: CustomDeck[]) => {
    setList(next);
    if (!saveCustomDecks(next)) setNotice("この端末には保存できませんでした（プライベートブラウズなど）");
  };
  const create = (cards: string[], name: string) =>
    setEditing({ id: newDeckId(), name, cards, updated: Date.now() });

  if (editing) {
    return (
      <DeckEditor
        deck={editing}
        onBack={() => setEditing(null)}
        onSave={(d) => {
          const next = list.some((x) => x.id === d.id)
            ? list.map((x) => (x.id === d.id ? d : x))
            : [...list, d];
          persist(next);
          setEditing(null);
          setNotice(`「${d.name}」を保存しました`);
        }}
      />
    );
  }

  return (
    <section className="page deck-builder">
      <header className="page-head">
        <h1>デッキ構築</h1>
        <p className="muted">
          {DECK_SIZE} 枚ちょうど・同じカードは {MAX_COPIES} 枚まで・属性は {MAX_DECK_ATTRIBUTES}{" "}
          つ（共通カードはいくつでも）。 保存したデッキは、この端末の「CPU
          と対戦」「オンライン対戦」で選べます。
        </p>
      </header>
      {notice && <p className="db-notice">{notice}</p>}
      <div className="db-actions">
        <button type="button" className="btn" onClick={() => create([], "新しいデッキ")}>
          空のデッキから作る
        </button>
        <label className="db-copy">
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value as DeckId | "")}>
            <option value="">構築済みデッキをコピーして作る…</option>
            {(Object.keys(DECK_INFO) as DeckId[]).map((id) => (
              <option key={id} value={id}>
                {DECK_INFO[id].name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost small"
            disabled={!copyFrom}
            onClick={() => {
              if (!copyFrom) return;
              const b = builtinDeck(copyFrom);
              create(b.cards, `${b.name}（コピー）`);
              setCopyFrom("");
            }}
          >
            コピー
          </button>
        </label>
      </div>
      {list.length === 0 ? (
        <p className="muted">まだデッキがありません。</p>
      ) : (
        <ul className="db-saved">
          {list.map((d) => {
            const attrs = attrsOf(d.cards);
            const errors = deckErrors(d.cards);
            return (
              <li key={d.id} className="db-saved-item">
                <div className="db-saved-info">
                  <strong>{d.name}</strong>
                  <span className="muted">
                    {attrs.length > 0 ? attrs.join("×") : "共通"}・{d.cards.length}枚
                    {errors.length > 0 && <b className="db-bad">（決まりを守れていません）</b>}
                  </span>
                </div>
                <div className="db-saved-btns">
                  <button type="button" className="btn ghost small" onClick={() => setEditing({ ...d })}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => create([...d.cards], `${d.name}（コピー）`)}
                  >
                    複製
                  </button>
                  <button
                    type="button"
                    className="btn ghost small danger"
                    onClick={() => {
                      if (window.confirm(`「${d.name}」を消しますか？`))
                        persist(list.filter((x) => x.id !== d.id));
                    }}
                  >
                    消す
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted">
        <Link to="/play">CPU と対戦</Link>・<Link to="/online">オンライン対戦</Link>{" "}
        のデッキ選択に「自分のデッキ」として出ます
      </p>
    </section>
  );
}

function DeckEditor({
  deck,
  onSave,
  onBack,
}: {
  deck: CustomDeck;
  onSave: (d: CustomDeck) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [counts, setCounts] = useState(() => countsOf(deck.cards));
  const [filter, setFilter] = useState<Filter>("全部");
  const [onlyIn, setOnlyIn] = useState(false);
  const [zoom, setZoom] = useState<CardDef | null>(null);

  const cards = useMemo(() => expand(counts), [counts]);
  const attrs = attrsOf(cards);
  const errors = deckErrors(cards);
  const curve = costCurve(cards);
  const total = cards.length;

  const canAdd = (c: CardDef) => {
    if ((counts.get(c.id) ?? 0) >= MAX_COPIES) return false;
    if (total >= DECK_SIZE) return false;
    const a = c.attributes[0];
    if (a && !attrs.includes(a) && attrs.length >= MAX_DECK_ATTRIBUTES) return false;
    return true;
  };
  const add = (id: string) => setCounts((m) => new Map(m).set(id, (m.get(id) ?? 0) + 1));
  const remove = (id: string) =>
    setCounts((m) => {
      const next = new Map(m);
      const n = (next.get(id) ?? 0) - 1;
      if (n <= 0) next.delete(id);
      else next.set(id, n);
      return next;
    });

  const shown = POOL.filter((c) => {
    if (onlyIn && !counts.has(c.id)) return false;
    if (filter === "全部") return true;
    if (filter === "共通") return c.attributes.length === 0;
    return c.attributes[0] === filter;
  });
  const maxCurve = Math.max(1, ...curve);

  return (
    <section className="page deck-builder">
      <div className="db-head">
        <div className="db-head-row">
          <button type="button" className="btn ghost small" onClick={onBack}>
            ← 戻る
          </button>
          <input
            className="db-name"
            value={name}
            maxLength={20}
            aria-label="デッキの名前"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={errors.length > 0}
            onClick={() =>
              onSave({ ...deck, name: name.trim() || "自分のデッキ", cards, updated: Date.now() })
            }
          >
            保存
          </button>
        </div>
        <div className="db-summary">
          <b className={total === DECK_SIZE ? "db-ok" : ""}>
            {total}/{DECK_SIZE}
          </b>
          <span className="db-attrs">
            {attrs.length > 0
              ? attrs.map((a) => (
                  <span
                    key={a}
                    className="chip attr"
                    style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}
                  >
                    {a}
                  </span>
                ))
              : "属性なし"}
          </span>
          <span className="db-curve" role="img" aria-label="コストごとの枚数">
            {COST_LABELS.map((label, i) => (
              <span key={label} className="db-bar" title={`${label}コスト ${curve[i] ?? 0}枚`}>
                <i style={{ height: `${((curve[i] ?? 0) / maxCurve) * 100}%` }} />
                <small>{label}</small>
                <em>{curve[i] ?? 0}</em>
              </span>
            ))}
          </span>
        </div>
        {errors.length > 0 && (
          <ul className="db-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="db-filter">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip ${filter === f ? "on" : ""}`}
            style={
              f !== "全部" && f !== "共通"
                ? {
                    background: filter === f ? ATTR_META[f].color : undefined,
                    color: filter === f ? ATTR_META[f].deep : undefined,
                  }
                : undefined
            }
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <label className="db-only">
          <input type="checkbox" checked={onlyIn} onChange={(e) => setOnlyIn(e.target.checked)} />
          入れたカードだけ
        </label>
      </div>

      <ul className="db-list">
        {shown.map((c) => {
          const n = counts.get(c.id) ?? 0;
          const a = c.attributes[0];
          const meta = a ? ATTR_META[a] : null;
          return (
            <li key={c.id} className={`db-row ${n > 0 ? "in" : ""}`}>
              <span
                className="db-cost"
                style={meta ? { background: meta.color, color: meta.deep } : undefined}
              >
                {c.cost}
              </span>
              <button type="button" className="db-card" onClick={() => setZoom(c)}>
                <span className="db-title">
                  {c.epithet && <small>{c.epithet} </small>}
                  <b>{c.name}</b>
                  <span className="db-stars">{"★".repeat(c.rarity)}</span>
                  {c.type === "icon" && (
                    <span className="db-stats">
                      <i className="t-atk">{c.attack}</i>/<i className="t-hp">{c.hp}</i>
                    </span>
                  )}
                </span>
                <span className="db-effect">
                  <AttrChips card={c} />
                  {c.effect && (
                    <span className="db-text">
                      <EffectText text={c.effect} />
                    </span>
                  )}
                </span>
              </button>
              <span className="db-count">
                <button
                  type="button"
                  className="db-step"
                  disabled={n === 0}
                  onClick={() => remove(c.id)}
                  aria-label="1枚減らす"
                >
                  −
                </button>
                <b>{n}</b>
                <button
                  type="button"
                  className="db-step"
                  disabled={!canAdd(c)}
                  onClick={() => add(c.id)}
                  aria-label="1枚増やす"
                >
                  ＋
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {zoom && <CardZoom key={zoom.id} card={zoom} darkPreview onClose={() => setZoom(null)} />}
    </section>
  );
}
