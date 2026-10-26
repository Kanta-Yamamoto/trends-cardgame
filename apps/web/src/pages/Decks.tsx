import {
  ATTRIBUTES,
  type Attribute,
  CARDS,
  type CardDef,
  DECK_SIZE,
  type DeckId,
  MAX_COPIES,
  MAX_DARK_CARDS,
  MAX_DECK_ATTRIBUTES,
} from "@trends/cards";
import { useCallback, useMemo, useState } from "react";
import { EffectText } from "../cards/EffectText";
import { ATTR_META } from "../cards/meta";
import { CardZoom } from "../game/CardZoom";
import { CostStrip } from "../game/CostStrip";
import { AttrDots, DeckAce, deckGradient } from "../game/DeckArt";
import { pushDecks, useDecksChanged } from "../game/deckSync";
import {
  attrsOf,
  builtinDeck,
  type CustomDeck,
  customDeckSel,
  deckErrors,
  loadCustomDecks,
  newDeckId,
  saveCustomDecks,
} from "../game/decks";
import { CATALOG as CARD_BY_ID, DECK_INFO } from "../game/store";
import { useSession } from "../online/session";

type Filter = Attribute | "ニュートラル" | "全部";
const FILTERS: Filter[] = ["全部", ...ATTRIBUTES, "ニュートラル"];
const ICON_PLUS = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const ICON_COPY = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);
const ICON_TRASH = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
/** デッキに入れられるカード（トークンは除く）。属性→コスト→★の順 */
const POOL: CardDef[] = CARDS.filter((c) => !c.token).sort(
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

/** デッキ構築：自分で 20 枚を組んで保存する（ログインしていればアカウントにも保存し、ほかの端末でも使える） */
export function Decks() {
  const [list, setList] = useState<CustomDeck[]>(() => loadCustomDecks());
  const [editing, setEditing] = useState<CustomDeck | null>(null);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const user = useSession((s) => s.user);
  // アカウントとそろえ終わったら、一覧を読み直す
  useDecksChanged(useCallback(() => setList(loadCustomDecks()), []));

  const persist = (next: CustomDeck[]) => {
    setList(next);
    if (!saveCustomDecks(next)) setNotice("この端末には保存できませんでした（プライベートブラウズなど）");
    if (user)
      pushDecks(next).then((ok) => {
        if (!ok)
          setNotice(
            "アカウントに保存できませんでした。この端末には保存してあります（次に開いたときにもう一度送ります）",
          );
      });
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

  const builtinIds = Object.keys(DECK_INFO) as DeckId[];
  return (
    <section className="page deck-builder">
      {notice && <p className="db-notice">{notice}</p>}
      <div className="db-make">
        <button type="button" className="db-mk new" onClick={() => create([], "新しいデッキ")}>
          <span className="db-mk-ic" aria-hidden="true">
            {ICON_PLUS}
          </span>
          <b>空のデッキから作る</b>
          <small>{DECK_SIZE}枚を自由に</small>
        </button>
        <button type="button" className="db-mk copy g2" onClick={() => setPicking(true)}>
          <span className="db-mk-ic" aria-hidden="true">
            {ICON_COPY}
          </span>
          <b>
            構築済みを
            <br />
            コピーして作る
          </b>
          <small>{builtinIds.length}個から選ぶ</small>
        </button>
      </div>
      <div className="sec">
        <h2>自分のデッキ</h2>
        <small>{list.length}個</small>
      </div>
      {list.length === 0 ? (
        <p className="muted db-empty">まだデッキがありません。</p>
      ) : (
        <ul className="db-saved">
          {list.map((d, i) => {
            const sel = customDeckSel(d);
            const errors = deckErrors(d.cards);
            const left = DECK_SIZE - d.cards.length;
            return (
              <li
                key={d.id}
                className="db-saved-item g2"
                style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}
              >
                <span className="db-thumb" style={{ background: deckGradient(sel.attrs, sel.ace) }}>
                  <DeckAce id={sel.ace} />
                </span>
                <div className="db-saved-body">
                  <div>
                    <h3 className="db-saved-name">{d.name}</h3>
                    <p className="db-saved-meta">
                      <span className="db-pill">
                        <AttrDots attrs={sel.attrs} />
                        {sel.attrs.length > 0 ? sel.attrs.join("×") : "ニュートラル"}
                      </span>
                      <span className={`db-cnt ${left === 0 ? "ok" : "ng"}`}>
                        {d.cards.length}/{DECK_SIZE}
                      </span>
                      {errors.length === 0 ? (
                        <span className="tag ok">使えます</span>
                      ) : (
                        <span className="tag ng">{left > 0 ? `あと${left}枚` : "直すところあり"}</span>
                      )}
                    </p>
                  </div>
                  <div className="db-saved-btns">
                    <button type="button" className="btn small" onClick={() => setEditing({ ...d })}>
                      編集
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="複製"
                      onClick={() => create([...d.cards], `${d.name}（コピー）`)}
                    >
                      {ICON_COPY}
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label="消す"
                      onClick={() => {
                        if (window.confirm(`「${d.name}」を消しますか？`))
                          persist(list.filter((x) => x.id !== d.id));
                      }}
                    >
                      {ICON_TRASH}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="db-foot g2">
        {DECK_SIZE} 枚ちょうど・同じカードは {MAX_COPIES} 枚まで・属性は {MAX_DECK_ATTRIBUTES}{" "}
        つ（ニュートラルのカードはいくつでも）・闇堕ちを持つカードは {MAX_DARK_CARDS}{" "}
        枚まで（種類は問わない）。保存したデッキは「CPUと対戦」「オンライン対戦」のデッキ選びに出ます。
        {user
          ? `${user.name} のアカウントに保存しています。ほかの端末でも使えます。`
          : "この端末にだけ保存しています。"}
      </p>
      {picking && (
        <div className="deck-confirm" role="dialog" aria-modal="true" aria-label="コピーする構築済みデッキ">
          <button
            type="button"
            className="deck-confirm-bg"
            aria-label="閉じる"
            onClick={() => setPicking(false)}
          />
          <section className="db-copy-body">
            <h2>どのデッキをコピーしますか</h2>
            <ul className="db-copy-list">
              {builtinIds.map((id) => {
                const b = builtinDeck(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicking(false);
                        create(b.cards, `${b.name}（コピー）`);
                      }}
                    >
                      <span className="db-copy-dots">
                        <AttrDots attrs={b.attrs} />
                      </span>
                      <span>{b.name}</span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn ghost lg" onClick={() => setPicking(false)}>
              やめる
            </button>
          </section>
        </div>
      )}
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
  const total = cards.length;

  const canAdd = (c: CardDef) => {
    if ((counts.get(c.id) ?? 0) >= MAX_COPIES) return false;
    if (total >= DECK_SIZE) return false;
    const a = c.attributes[0];
    if (a && !attrs.includes(a) && attrs.length >= MAX_DECK_ATTRIBUTES) return false;
    // 闇堕ちを持つカードは、種類を問わず2枚まで
    if (c.dark && cards.filter((id) => CARD_BY_ID[id]?.dark).length >= MAX_DARK_CARDS) return false;
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
    if (filter === "ニュートラル") return c.attributes.length === 0;
    return c.attributes[0] === filter;
  });
  const full = total === DECK_SIZE;
  const darkN = cards.filter((id) => CARD_BY_ID[id]?.dark).length;
  // 枚数の足りなさは上の輪と札で見せるので、それ以外の直すところだけ並べる
  const otherErrors = errors.filter((e) => !e.startsWith("デッキは"));

  return (
    <section className="page deck-builder db-editor">
      <div className="db-head">
        <div className="db-head-row">
          <button type="button" className="topbar-back g1" aria-label="デッキの一覧に戻る" onClick={onBack}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
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
            className="btn db-save"
            disabled={errors.length > 0}
            onClick={() =>
              onSave({ ...deck, name: name.trim() || "自分のデッキ", cards, updated: Date.now() })
            }
          >
            保存
          </button>
        </div>
        <section className="db-sum g2">
          <span className={`db-ring ${full ? "full" : ""}`}>
            <svg viewBox="0 0 76 76" aria-hidden="true">
              <defs>
                <linearGradient id="db-ring-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#9fe3fb" />
                  <stop offset=".5" stopColor="#2fa8e4" />
                  <stop offset="1" stopColor="#1272b0" />
                </linearGradient>
              </defs>
              <circle className="bg" cx="38" cy="38" r="32" />
              <circle
                className="fg"
                cx="38"
                cy="38"
                r="32"
                strokeDasharray="201"
                strokeDashoffset={201 * (1 - Math.min(1, total / DECK_SIZE))}
              />
            </svg>
            <b>
              {total}
              <small>/ {DECK_SIZE}</small>
            </b>
          </span>
          <div className="db-sum-r">
            <p className="db-sum-top">
              <span className="db-pill">
                <AttrDots attrs={attrs} />
                {attrs.length > 0 ? attrs.join("×") : "属性なし"}
              </span>
              {errors.length === 0 ? (
                <span className="tag ok">使えます</span>
              ) : (
                <span className="tag ng">
                  {total < DECK_SIZE ? `あと${DECK_SIZE - total}枚` : "直すところあり"}
                </span>
              )}
              <span className="db-dark-n">
                闇堕ち {darkN}/{MAX_DARK_CARDS}
              </span>
            </p>
            <CostStrip cards={cards} />
          </div>
        </section>
        {otherErrors.length > 0 && (
          <ul className="db-errors">
            {otherErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="db-filter" role="toolbar" aria-label="絞り込み">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`g-chip ${f === "全部" ? "all" : ""} ${filter === f ? "on" : ""}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "ニュートラル" ? (
                <span className="at neutral" aria-hidden="true">
                  ニ
                </span>
              ) : f !== "全部" ? (
                <span className="at" style={{ background: ATTR_META[f].color }} aria-hidden="true">
                  {ATTR_META[f].mark}
                </span>
              ) : null}
              {f}
            </button>
          ))}
          <button
            type="button"
            className={`g-chip all ${onlyIn ? "on" : ""}`}
            aria-pressed={onlyIn}
            onClick={() => setOnlyIn((v) => !v)}
          >
            入れたカードだけ
          </button>
        </div>
      </div>

      <ul className="db-list">
        {shown.map((c) => {
          const n = counts.get(c.id) ?? 0;
          const a = c.attributes[0];
          const meta = a ? ATTR_META[a] : null;
          return (
            <li key={c.id} className={`db-row g2 ${n > 0 ? "in" : ""}`}>
              <span className="db-cost">{c.cost}</span>
              <button type="button" className="db-card" onClick={() => setZoom(c)}>
                <span className="db-title">
                  {a && meta ? (
                    <span className="at" style={{ background: meta.color }} title={a}>
                      {meta.mark}
                    </span>
                  ) : (
                    <span className="at neutral" title="ニュートラル">
                      ニ
                    </span>
                  )}
                  <b>{c.name}</b>
                </span>
                <span className="db-tags">
                  {c.type === "icon" && (
                    <>
                      <i className="db-ball atk">{c.attack}</i>
                      <i className="db-ball hp">{c.hp}</i>
                    </>
                  )}
                  <span className="db-stars">{"★".repeat(c.rarity)}</span>
                  {c.kaiwai.map((k) => (
                    <span key={k} className="tag">
                      {k}界隈
                    </span>
                  ))}
                  {c.dark && <span className="tag db-dark">闇堕ち</span>}
                </span>
                {c.effect && (
                  <span className="db-text">
                    <EffectText text={c.effect} />
                  </span>
                )}
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
                  className="db-step plus"
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
