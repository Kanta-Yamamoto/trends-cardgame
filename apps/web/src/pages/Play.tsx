import { type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  type AttackPreview,
  type AttackTarget,
  attackTargets,
  type CastTarget,
  canDarkFall,
  canUnitAttack,
  castTargets,
  darkReady,
  effectiveCost,
  type GameEvent,
  type GameState,
  type PlayerId,
  previewAttack,
  SLOTS,
  type Unit,
  type UnitView,
  viewUnit,
} from "@trends/game-core";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { CardZoom } from "../game/CardZoom";
import { type DarkCut, DarkCutscene } from "../game/DarkCutscene";
import {
  animateAttack,
  animateDraw,
  animateEffects,
  flipCard,
  hasVisibleEffects,
  popDamage,
  popMaster,
} from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { CATALOG, CPU, DECK_INFO, ME, setPresenter, useGame } from "../game/store";
import { useDragPlay } from "../game/useDragPlay";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SLOT_KEYS = Array.from({ length: SLOTS }, (_, i) => `slot-${i}`);
const nameOf = (id: string) => CATALOG[id]?.name ?? id;
const who = (p: string) => (p === ME ? "あなた" : useGame.getState().foeName);

function describe(e: GameEvent): string {
  switch (e.type) {
    case "played":
      return `${who(e.player)}：${nameOf(e.cardId)} を出した（話題力 ${e.cost}）`;
    case "cast":
      return `${who(e.player)}：${nameOf(e.cardId)} を投稿（話題力 ${e.cost}）`;
    case "summoned":
      return `${who(e.player)}の場に ${nameOf(e.cardId)} が出た`;
    case "battle": {
      const lost = e.destroyed.map(nameOf).join("・");
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}：${e.toDefender} ダメージ、反撃 ${e.toAttacker}${lost ? `（オワコン：${lost}）` : ""}`;
    }
    case "damaged":
      return `${nameOf(e.cardId)} に ${e.amount} ダメージ`;
    case "destroyed":
      return `${who(e.player)}の ${nameOf(e.cardId)} がオワコンになった`;
    case "darkFall":
      return `${who(e.player)}の ${nameOf(e.cardId)} が、闇堕ちしてオワコンから戻ってきた！`;
    case "restored":
      return `${who(e.player)}の ${nameOf(e.cardId)} が表に戻った`;
    case "status":
      return `${nameOf(e.cardId)}：${e.status}`;
    case "buffed":
      return `${nameOf(e.cardId)} の攻撃力${e.attack >= 0 ? "+" : ""}${e.attack}${e.hp ? `・体力+${e.hp}` : ""}`;
    case "healed":
      return `${nameOf(e.cardId)} の体力が ${e.amount} 回復`;
    case "leaderDamaged":
      return `${who(e.player)}のマスターに ${e.amount} ダメージ（ライフ ${e.lp}）`;
    case "leaderHealed":
      return `${who(e.player)}のライフが ${e.amount} 回復（ライフ ${e.lp}）`;
    case "drew":
      return `${who(e.player)}が1枚引いた`;
    case "deckOut":
      return `${who(e.player)}の山札が切れた`;
    case "turnStarted":
      return `―― ${e.turn}ターン目：${who(e.player)}（話題力 ${e.mana}）――`;
    case "stolen":
      return `${who(e.player)}が ${nameOf(e.cardId)} を奪った（推し変）`;
    case "extraTurn":
      return `${who(e.player)}は、このあともう一度ターンを行う`;
    case "resigned":
      return `${who(e.player)}が降参した`;
    case "won":
      return `${who(e.player)}の勝ち`;
  }
}

/**
 * 対戦画面は「舞台」を作って、画面に合わせて拡大・縮小する。
 * - 切り欠き・ホームバー（セーフエリア）を除いた範囲に収める（iPhone の横画面で左右が欠けて重なるのを防ぐ）
 * - 横長の画面ほど舞台を低くして、カードを大きく・横いっぱいに使う（16:9 で 960×540、20:9 で 960×432 まで）
 * - 舞台の高さに合わせて、場の枠の大きさ（--slot）を決める
 */
const STAGE_W = 960;
const STAGE_H = 540;
const STAGE_H_MIN = 432;
/** 場の枠の幅から決まる、舞台の縦の長さ（余白＋案内＋場2段＋手札）。stage の CSS と合わせる */
const fitSlot = (height: number) => Math.min(100, Math.floor((height - 84) / 4.08));

interface Stage {
  width: number;
  height: number;
  scale: number;
  slot: number;
  cx: number;
  cy: number;
}

function safeArea(probe: HTMLElement | null) {
  if (!probe) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}

export function measureStage(vw: number, vh: number, safe = { t: 0, r: 0, b: 0, l: 0 }): Stage {
  const w = Math.max(1, vw - safe.l - safe.r);
  const h = Math.max(1, vh - safe.t - safe.b);
  const aspect = w / h;
  const height = Math.min(STAGE_H, Math.max(STAGE_H_MIN, STAGE_W / aspect));
  const width = Math.max(STAGE_W, height * aspect);
  return {
    width,
    height,
    scale: Math.min(w / width, h / height),
    slot: fitSlot(height),
    cx: safe.l + w / 2,
    cy: safe.t + h / 2,
  };
}

function useStage() {
  const probe = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>(() => measureStage(STAGE_W, STAGE_H));
  useLayoutEffect(() => {
    const on = () => setStage(measureStage(window.innerWidth, window.innerHeight, safeArea(probe.current)));
    on();
    // iPhone は向きを変えた直後のサイズが古いことがあるので、少し後にも測り直す
    const later = () => setTimeout(on, 300);
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", later);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", later);
    };
  }, []);
  return { stage, probe };
}

export function Play() {
  const deck = useGame((s) => s.deck);
  return <section className="page play">{deck ? <Board /> : <DeckSelect />}</section>;
}

const DECK_ATTRS: Record<DeckId, CardDef["attributes"]> = {
  flame: ["炎上", "草"],
  idol: ["メロい", "癒し"],
  expert: ["神", "癒し"],
  ronpa: ["炎上", "神"],
  dance: ["草", "メロい"],
  scandal: ["炎上", "メロい"],
  phoenix: ["炎上", "癒し"],
  wiki: ["神", "草"],
  theory: ["神", "メロい"],
  chill: ["草", "癒し"],
};

function DeckSelect() {
  const start = useGame((s) => s.start);
  return (
    <>
      <header className="page-head">
        <h1>CPU と対戦</h1>
        <p className="muted">
          デッキを選んでください。CPU はほかのデッキから1つを使います。先攻・後攻はランダムです。
        </p>
      </header>
      <DeckGrid onPick={start} />
      <details className="rules">
        <summary>ルール（かんたん版）</summary>
        <ul>
          <li>相手のマスターのライフ（20）を 0 にすれば勝ち。山札が引けなくなっても負け</li>
          <li>
            話題力は毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。後攻は手札 +1
            枚、最初のターンだけ話題力 +1
          </li>
          <li>
            アイコンは場に 5 体まで出せる。出したターンは攻撃できない（速攻を除く）。投稿は使い切りの効果
          </li>
          <li>
            アイコン同士で戦うと、お互いの<b className="t-atk">攻撃力</b>の分だけ相手の
            <b className="t-hp">体力</b>
            が減る。体力が 0 になったアイコンはオワコンへ。受けたダメージは残る
          </li>
          <li>相手の場にガードがいる間は、ガード（と晒し者）しか攻撃できない</li>
          <li>
            闇堕ちを持つ★5は、オワコンに行ったら自分のターンの好きなときに、コストなしで闇堕ちの姿で出せる（1枚につき1回。出たターンは攻撃できない）
          </li>
        </ul>
      </details>
    </>
  );
}

/** デッキを選ぶボタンの並び（CPU 戦とオンライン対戦で共通） */
/**
 * デッキを選ぶ。confirmLabel を渡すと、押してすぐには決めず、中身を見せて確かめてから onPick する
 * （オンライン対戦は選んだらすぐ部屋ができるので、押し間違いを防ぐ）
 */
export function DeckGrid({
  onPick,
  confirmLabel,
}: {
  onPick: (deck: DeckId) => void;
  confirmLabel?: string;
}) {
  const [pending, setPending] = useState<DeckId | null>(null);
  return (
    <div className="decks">
      {(Object.keys(DECK_INFO) as DeckId[]).map((id) => {
        const [a, b] = DECK_ATTRS[id].map((x) => ATTR_META[x]);
        return (
          <button
            key={id}
            type="button"
            className="deck-pick"
            style={{
              background: `linear-gradient(125deg, ${a?.color}, ${a?.deep} 50%, ${b?.deep} 50%, ${b?.color})`,
            }}
            onClick={() => (confirmLabel ? setPending(id) : onPick(id))}
          >
            <span className="deck-attrs">{DECK_ATTRS[id].join(" × ")}</span>
            <strong>{DECK_INFO[id].name}</strong>
            <span>{DECK_INFO[id].text}</span>
          </button>
        );
      })}
      {pending && confirmLabel && (
        <DeckConfirm
          deck={pending}
          label={confirmLabel}
          onConfirm={() => {
            setPending(null);
            onPick(pending);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** デッキの確認（名前・属性・説明と、入っているカード） */
function DeckConfirm({
  deck,
  label,
  onConfirm,
  onCancel,
}: {
  deck: DeckId;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const counts = new Map<string, number>();
  for (const id of DECKS[deck]) counts.set(id, (counts.get(id) ?? 0) + 1);
  const list = [...counts]
    .map(([id, n]) => ({ card: CATALOG[id], n }))
    .filter((x): x is { card: CardDef; n: number } => !!x.card)
    .sort((x, y) => y.card.rarity - x.card.rarity || x.card.cost - y.card.cost);
  const [a, b] = DECK_ATTRS[deck].map((x) => ATTR_META[x]);
  return (
    <div className="zoom-sheet deck-confirm" role="dialog" aria-modal="true" aria-label="デッキの確認">
      <button type="button" className="zoom-sheet-bg" aria-label="選び直す" onClick={onCancel} />
      <div className="deck-confirm-body">
        <div
          className="deck-confirm-head"
          style={{
            background: `linear-gradient(125deg, ${a?.color}, ${a?.deep} 50%, ${b?.deep} 50%, ${b?.color})`,
          }}
        >
          <span className="deck-attrs">{DECK_ATTRS[deck].join(" × ")}</span>
          <strong>{DECK_INFO[deck].name}</strong>
          <span>{DECK_INFO[deck].text}</span>
        </div>
        <ul className="deck-confirm-list">
          {list.map(({ card, n }) => (
            <li key={card.id}>
              <span className="dc-cost">{card.cost}</span>
              <span className="dc-name">{card.name}</span>
              <span className="dc-stars">{"★".repeat(card.rarity)}</span>
              <span className="dc-n">×{n}</span>
            </li>
          ))}
        </ul>
        <div className="deck-confirm-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            選び直す
          </button>
          <button type="button" className="btn" onClick={onConfirm}>
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ターン終了の確認。まだ攻撃できるアイコンや、残っている話題力があれば添える */
function EndTurnConfirm({
  attackers,
  mana,
  onYes,
  onNo,
}: {
  attackers: number;
  mana: number;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);
  const notes = [
    attackers > 0 && `まだ攻撃できるアイコンが ${attackers} 体います`,
    mana > 0 && `話題力が ${mana} 残っています`,
  ].filter((x): x is string => !!x);
  return (
    <div
      className="zoom-sheet end-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-label="ターン終了の確認"
    >
      <button type="button" className="zoom-sheet-bg" aria-label="やめる" onClick={onNo} />
      <div className="end-confirm-body">
        <p className="end-confirm-q">ターンを終了しますか？</p>
        {notes.map((n) => (
          <p key={n} className="end-confirm-note">
            {n}
          </p>
        ))}
        <div className="end-confirm-actions">
          <button type="button" className="btn ghost" onClick={onNo}>
            いいえ
          </button>
          <button type="button" className="btn" onClick={onYes}>
            はい、終了する
          </button>
        </div>
      </div>
    </div>
  );
}

type Peek = { id: string; view?: UnitView; where: "hand" | "mine" | "foe" | "trash"; index: number };

/** ドラッグしているもの（手札のカード／攻撃するアイコン） */
type DragSrc = { kind: "hand"; index: number } | { kind: "unit"; slot: number };

/** 攻撃したときの見込み（与えるダメージ・叩き・倒せるか）を、攻撃先に重ねて出す */
function AttackBadge({ pv, leader }: { pv: AttackPreview; leader?: boolean }) {
  const tag = leader
    ? pv.kills && "とどめ"
    : pv.kills && pv.dies
      ? "相打ち"
      : pv.kills
        ? "倒せる"
        : pv.dies
          ? "倒される"
          : null;
  return (
    <span className={`atk-pv ${pv.kills ? "kill" : ""}`} aria-hidden="true">
      <b>-{pv.toDefender}</b>
      {pv.bonus > 0 && <i className="pv-bash">叩き+{pv.bonus}</i>}
      {tag && <i className={pv.dies && !pv.kills ? "pv-die" : "pv-tag"}>{tag}</i>}
    </span>
  );
}

/** 攻撃するアイコンから指先（攻撃先）へ伸ばす矢印 */
function AttackArrow({
  from,
  to,
  hot,
  ally,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  hot: boolean;
  /** 味方を狙う投稿（緑の矢印） */
  ally?: boolean;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  const head = 18;
  const bx = to.x - ux * head;
  const by = to.y - uy * head;
  const wing = (s: number) => `${bx - uy * 11 * s},${by + ux * 11 * s}`;
  return (
    <svg className={`atk-arrow ${hot ? "hot" : ""} ${hot && ally ? "ally" : ""}`} aria-hidden="true">
      <line x1={from.x} y1={from.y} x2={bx} y2={by} />
      <polygon points={`${to.x},${to.y} ${wing(1)} ${wing(-1)}`} />
      <circle cx={from.x} cy={from.y} r={7} />
    </svg>
  );
}

/** 対戦の画面。CPU 戦とオンライン対戦で共通（onQuit を渡すと「戻る」でそれを呼ぶ） */
export function Board({ onQuit }: { onQuit?: () => void } = {}) {
  const {
    game,
    deck,
    log,
    error,
    selection,
    cpuBusy,
    animating,
    select,
    play,
    cast,
    attack,
    endTurn,
    start,
    quit: quitGame,
    mode,
    foeName,
    resign,
  } = useGame();
  const online = mode === "online";
  const quit = () => {
    quitGame();
    onQuit?.();
  };
  const [resignAsk, setResignAsk] = useState(false);
  /** 相手が出した・使ったカードを大きく見せる */
  const [reveal, setReveal] = useState<{
    id: number;
    cardId: string;
    kind: "play" | "cast";
    mine?: boolean;
  } | null>(null);
  /** 闇堕ちの演出（画面全体） */
  const [cut, setCut] = useState<DarkCut | null>(null);
  /** 手札が多いときに、全部を大きく並べて見る */
  const [handOpen, setHandOpen] = useState(false);
  const [peek, setPeek] = useState<Peek | null>(null);
  /** 画面いっぱいに大きく見ているカード（スマホで効果を読むため） */
  const [zoom, setZoom] = useState<Peek | null>(null);
  const [banner, setBanner] = useState<{ id: number; mine: boolean; turn: number } | null>(null);
  const [trashView, setTrashView] = useState<PlayerId | null>(null);
  const seen = useRef(0);
  const { stage, probe } = useStage();
  /** ターン終了の確認を出しているか（押し間違いで終わらないように） */
  const [confirmEnd, setConfirmEnd] = useState(false);

  const handUsable = (g: GameState, i: number) => {
    const id = g.players[ME].hand[i];
    const card = id ? CATALOG[id] : undefined;
    if (!id || !card) return false;
    const p = g.players[ME];
    return (
      effectiveCost(g, ME, id, CATALOG) <= p.mana &&
      (card.type === "icon"
        ? p.field.some((u) => !u)
        : !card.target || castTargets(g, ME, id, CATALOG).length > 0)
    );
  };

  // 手札を枠・対象へ、場のアイコンを攻撃先へ引っぱって離す（シャドバのような操作。タップでの操作もそのまま使える）
  const { drag, begin, justDragged } = useDragPlay<DragSrc>({
    onStart: (src) => {
      const s = useGame.getState();
      const g = s.game;
      if (!g || g.active !== ME || g.winner || s.cpuBusy || s.animating) return false;
      if (src.kind === "hand") {
        if (!handUsable(g, src.index)) return false;
        const id = g.players[ME].hand[src.index] as string;
        setPeek({ id, where: "hand", index: src.index });
        select({ kind: "hand", index: src.index });
        return true;
      }
      const u = g.players[ME].field[src.slot];
      if (!u || !canUnitAttack(g, u)) return false;
      setPeek({ id: u.cardId, view: viewUnit(g, ME, u, CATALOG), where: "mine", index: src.slot });
      select({ kind: "attacker", slot: src.slot });
      return true;
    },
    onDrop: (src, over) => {
      const g = useGame.getState().game;
      if (!g) return;
      const [where, n] = (over ?? "").split(":");
      const slot = Number(n);
      if (src.kind === "hand") {
        const card = CATALOG[g.players[ME].hand[src.index] ?? ""];
        if (!card) return select(null);
        if (card.type === "icon") return where === "slot" ? play(slot) : select(null);
        if (card.target) {
          const ok = castTargets(g, ME, card.id, CATALOG).some(
            (t) =>
              (where === "foe" && t.side === "enemy" && t.slot === slot) ||
              (where === "ally" && t.side === "ally" && t.slot === slot),
          );
          return ok ? cast({ side: where === "foe" ? "enemy" : "ally", slot }) : select(null);
        }
        // 対象を取らない投稿は、手札より上の場所で離せば使う
        return over && over !== "hand" ? cast() : select(null);
      }
      const legal = attackTargets(g, ME, src.slot, CATALOG);
      if (where === "leader" && legal.some((t) => t.kind === "leader")) return attack({ kind: "leader" });
      if (where === "foe" && legal.some((t) => t.kind === "unit" && t.slot === slot)) {
        return attack({ kind: "unit", slot });
      }
      // 自分の上で離したら、選んだまま（タップで攻撃先を選べる）
      if (over !== `ally:${src.slot}`) select(null);
    },
    onCancel: () => select(null),
  });

  // 攻撃の演出を store に登録する（演出が終わってから state を進める）
  useEffect(() => {
    setPresenter({
      beforeAttack: (g, a) => animateAttack(g, a.player, a.from, a.target, CATALOG),
      turnIntro: 1100,
      resolveEffects: async (shown, a, events, next) => {
        const visible = hasVisibleEffects(events);
        const cardId = events.find((e) => e.type === "played" || e.type === "cast");
        const card = cardId && "cardId" in cardId ? CATALOG[cardId.cardId] : undefined;
        const attr = card?.attributes[0];
        const tint = attr ? ATTR_META[attr].color : undefined;
        if (a.type === "cast") {
          // 自分の投稿も、使ったカードを真ん中に見せてから効果を飛ばす（相手の投稿は revealFoe で見せ済み）
          if (a.player === ME && card) {
            const id = Date.now();
            setReveal({ id, cardId: card.id, kind: "cast", mine: true });
            setTimeout(() => setReveal((r) => (r?.id === id ? null : r)), 1000);
            await wait(visible ? 620 : 900);
          }
          if (visible) {
            const from = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            await animateEffects(shown, events, next, { from, tint });
          }
        } else if (a.type === "play" || a.type === "darkFall") {
          if (!visible) return;
          await wait(420); // 出たアイコンが場に着くのを待つ
          const uid = next.players[a.player].field[a.slot]?.uid;
          const from = uid ? document.querySelector<HTMLElement>(`[data-uid="${uid}"]`) : null;
          await animateEffects(shown, events, next, { from, tint });
        } else if (visible) {
          await animateEffects(shown, events, next, { from: null });
        }
      },
      darkFall: (cardId, player) =>
        new Promise<void>((resolve) => {
          setCut({ id: Date.now(), cardId, mine: player === ME, done: resolve });
        }),
      revealFoe: (g, cardId, a) =>
        new Promise<void>((resolve) => {
          setReveal({ id: Date.now(), cardId, kind: a.type });
          // 対象がある投稿は、狙われたアイコンを光らせる（相手から見た enemy＝こちらのアイコン）
          const t = a.type === "cast" ? a.target : undefined;
          const uid = t ? g.players[t.side === "enemy" ? ME : CPU].field[t.slot]?.uid : undefined;
          const el = uid ? document.querySelector(`[data-uid="${uid}"]`) : null;
          el?.classList.add("fx-targeted");
          setTimeout(() => {
            setReveal(null);
            el?.classList.remove("fx-targeted");
            resolve();
          }, 1300);
        }),
    });
    return () => setPresenter(null);
  }, []);

  // 新しい出来事に合わせて演出を出す（ターン開始のバナー・ドロー・効果の数字・闇堕ち）
  useLayoutEffect(() => {
    const last = log.at(-1)?.id ?? 0;
    if (last < seen.current) seen.current = 0; // 新しい対戦
    const fresh = log.filter((l) => l.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = last;
    const g = useGame.getState().game;
    const uidAt = (p: PlayerId, slot: number) => g?.players[p].field[slot]?.uid;
    let t = 0;
    for (const { id, e, fx } of fresh) {
      // 効果の演出で見せ終わった数字は出さない
      if (fx && (e.type === "damaged" || e.type === "leaderDamaged" || e.type === "leaderHealed")) continue;
      if (e.type === "turnStarted") {
        setBanner({ id, mine: e.player === ME, turn: e.turn });
        t += 950;
      } else if (e.type === "drew") {
        void animateDraw(e.player, t);
        t += 180;
      } else if (e.type === "leaderHealed") {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `+${amount}`, "heal"), t);
      } else if (e.type === "leaderDamaged" && !fresh.some((l) => l.e.type === "battle")) {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `-${amount}`, "dmg"), t);
      } else if (e.type === "damaged") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => popDamage(uid, e.amount), t);
      } else if (e.type === "darkFall" || e.type === "restored") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
      }
    }
  }, [log]);

  if (!game || !deck) return null;
  const me = game.players[ME];
  const foe = game.players[CPU];
  const myTurn = game.active === ME && !game.winner && !cpuBusy && !animating;
  const attacking = selection?.kind === "attacker";
  const selectedCard = selection?.kind === "hand" ? CATALOG[me.hand[selection.index] ?? ""] : undefined;
  const postSelected = selectedCard?.type === "post";
  const castOptions: CastTarget[] =
    postSelected && selection?.kind === "hand"
      ? castTargets(game, ME, me.hand[selection.index] as string, CATALOG)
      : [];
  const canCastOn = (side: "enemy" | "ally", slot: number) =>
    castOptions.some((t) => t.side === side && t.slot === slot);
  const targets = attacking ? attackTargets(game, ME, selection.slot, CATALOG) : [];
  const placing = selection?.kind === "dark";
  const myDark = myTurn ? darkReady(game, ME, CATALOG) : [];
  const foeDark = darkReady(game, CPU, CATALOG);
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const preview = (t: AttackTarget) =>
    attacking && canHit(t) ? previewAttack(game, ME, selection.slot, t, CATALOG) : null;
  const foeGuarded = foe.field.some((u) => u && viewUnit(game, CPU, u, CATALOG).guard);
  const peekCard = peek ? CATALOG[peek.id] : null;
  const hint = game.winner
    ? ""
    : game.active === CPU
      ? online
        ? `${foeName}のターンです`
        : "CPU が考えています…"
      : !myTurn
        ? ""
        : postSelected
          ? selectedCard?.target
            ? "使う相手を選んでください（光っているアイコン）"
            : "もう一度カードを押すと投稿します"
          : selection?.kind === "dark"
            ? `${nameOf(selection.cardId)} を闇堕ちさせる枠を押してください`
            : selection?.kind === "hand"
              ? "出す枠を押してください（もう一度カードを押すと、選ぶのをやめます）"
              : attacking
                ? foeGuarded
                  ? "攻撃先を選んでください（ガードがいるので、ガードと晒し者しか攻撃できません）"
                  : "攻撃先を選んでください（光っているところ）"
                : canDarkFall(game, ME, CATALOG)
                  ? "闇堕ちできるカードがオワコンにあります（左のオワコンを押す）"
                  : "手札をドラッグして場に出す・投稿／アイコンを相手へドラッグして攻撃（タップでも可・長押しで拡大）";

  const unitCard = (owner: PlayerId, slot: number, u: Unit) => {
    const card = CATALOG[u.cardId] as CardDef;
    const view = viewUnit(game, owner, u, CATALOG);
    const where = owner === ME ? "mine" : "foe";
    const p: Peek = { id: card.id, view, where, index: slot };
    if (owner === CPU) {
      const hit = attacking && canHit({ kind: "unit", slot });
      const castable = canCastOn("enemy", slot);
      const pv = preview({ kind: "unit", slot });
      return (
        <MiniCard
          key={u.uid}
          uid={u.uid}
          card={card}
          view={view}
          drop={`foe:${slot}`}
          className={`unit foe-unit enter ${hit || castable ? "targetable" : ""} ${drag?.over === `foe:${slot}` && (hit || castable) ? "drop-over" : ""}`}
          onClick={() => {
            if (justDragged()) return;
            castable ? cast({ side: "enemy", slot }) : hit ? attack({ kind: "unit", slot }) : setPeek(p);
          }}
          onPeek={() => setPeek(p)}
          onLongPress={() => setZoom(p)}
        >
          {pv && <AttackBadge pv={pv} />}
        </MiniCard>
      );
    }
    const selected = attacking && selection.slot === slot;
    const ready = myTurn && canUnitAttack(game, u);
    const castable = canCastOn("ally", slot);
    return (
      <MiniCard
        key={u.uid}
        uid={u.uid}
        card={card}
        view={view}
        drop={`ally:${slot}`}
        className={`unit enter ${ready ? "ready" : "tired"} ${selected ? "selected" : ""} ${castable ? "targetable ally" : ""} ${castable && drag?.over === `ally:${slot}` ? "drop-over" : ""}`}
        onPress={ready ? (e) => begin(e, { kind: "unit", slot }) : undefined}
        onClick={() => {
          if (justDragged()) return;
          if (castable) return cast({ side: "ally", slot });
          if (selected) return select(null);
          setPeek(p);
          if (ready) select({ kind: "attacker", slot });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      >
        {ready && <em className="mini-ready">{u.attacksLeft > 1 ? "2回攻撃" : "攻撃できる"}</em>}
      </MiniCard>
    );
  };

  const handCard = (id: string, i: number, inSheet = false) => {
    const card = CATALOG[id];
    if (!card) return null;
    const cost = effectiveCost(game, ME, id, CATALOG);
    const usable =
      myTurn &&
      cost <= me.mana &&
      (card.type === "icon" ? freeSlot >= 0 : !card.target || castTargets(game, ME, id, CATALOG).length > 0);
    const selected = selection?.kind === "hand" && selection.index === i;
    const p: Peek = { id, where: "hand", index: i };
    return (
      <MiniCard
        key={`${id}-${i}`}
        inHand
        card={card}
        cost={cost}
        className={`in-hand ${usable ? "playable" : "short"} ${selected ? "selected" : ""} ${!inSheet && drag?.src.kind === "hand" && drag.src.index === i ? (card.type === "post" && card.target ? "selected" : "drag-src") : ""}`}
        // 手元で扇のように持つ（真ん中からのずれ。広げた一覧では使わない）
        style={inSheet ? undefined : ({ "--f": i - (me.hand.length - 1) / 2 } as CSSProperties)}
        onPress={inSheet || !usable ? undefined : (e) => begin(e, { kind: "hand", index: i })}
        onClick={() => {
          if (justDragged()) return;
          setPeek(p);
          if (!myTurn) return;
          if (inSheet) setHandOpen(false);
          if (selected && card.type === "post" && !card.target) return cast();
          // アイコンは、出す枠を自分で選んだときだけ出す（もう一度押しても勝手に出さず、選ぶのをやめる）
          select(selected ? null : { kind: "hand", index: i });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      />
    );
  };

  return (
    <div className="play-full">
      <div className="safe-probe" ref={probe} aria-hidden="true" />
      <div
        className="stage"
        style={
          {
            left: stage.cx,
            top: stage.cy,
            width: stage.width,
            height: stage.height,
            transform: `translate(-50%, -50%) scale(${stage.scale})`,
            "--slot": `${stage.slot}px`,
          } as CSSProperties
        }
      >
        <div className="stage-grid">
          <div className="col-left">
            <PlayerBar
              side="foe"
              name={foeName}
              lp={foe.lp}
              mana={foe.mana}
              maxMana={foe.maxMana}
              hand={foe.hand.length}
              active={game.active === CPU}
              guarded={foeGuarded}
              targetable={attacking && canHit({ kind: "leader" })}
              dropOver={drag?.over === "leader" && attacking && canHit({ kind: "leader" })}
              preview={preview({ kind: "leader" })}
              onClick={() => !justDragged() && attack({ kind: "leader" })}
              piles={
                <Piles
                  owner={CPU}
                  deck={foe.deck.length}
                  trash={foe.trash}
                  onTrash={() => setTrashView(CPU)}
                  dark={foeDark.length > 0 ? "foe" : undefined}
                />
              }
            />
            {!game.winner && (
              <span className={`turn-pill ${game.active === ME ? "mine" : "foe"}`}>
                {game.active === ME ? "あなたのターン" : "相手のターン"}
              </span>
            )}
            <PlayerBar
              side="me"
              name="あなた"
              lp={me.lp}
              mana={me.mana}
              maxMana={me.maxMana}
              hand={me.hand.length}
              active={game.active === ME}
              piles={
                <Piles
                  owner={ME}
                  deck={me.deck.length}
                  trash={me.trash}
                  onTrash={() => setTrashView(ME)}
                  dark={myDark.length > 0 ? "mine" : undefined}
                />
              }
            />
          </div>

          <div className={`col-center board turn-${game.active === ME ? "me" : "foe"}`} data-drop="board">
            <div className="row">
              {SLOT_KEYS.map((key, slot) => {
                const u = foe.field[slot];
                return u ? (
                  unitCard(CPU, slot, u)
                ) : (
                  <div key={key} className={`slot ${slot === 2 ? "center" : ""}`} />
                );
              })}
            </div>
            <p
              className={`hint ${error ? "is-error" : ""}`}
              aria-live="polite"
              role={error ? "alert" : undefined}
            >
              {error ?? hint}
            </p>
            <div className="row">
              {SLOT_KEYS.map((key, slot) => {
                const u = me.field[slot];
                if (u) return unitCard(ME, slot, u);
                const drop = myTurn && ((selection?.kind === "hand" && !postSelected) || placing);
                return (
                  <button
                    key={key}
                    type="button"
                    data-drop={`slot:${slot}`}
                    className={`slot ${slot === 2 ? "center" : ""} ${drop ? "droppable" : ""} ${drop && drag?.over === `slot:${slot}` ? "drop-over" : ""}`}
                    disabled={!drop}
                    aria-label={`空き枠 ${slot + 1}${slot === 2 ? "（センター）" : ""}`}
                    onClick={() => play(slot)}
                  />
                );
              })}
            </div>
            <div
              className="hand"
              data-hand={ME}
              data-drop="hand"
              style={{ "--n": me.hand.length } as CSSProperties}
            >
              {me.hand.map((id, i) => handCard(id, i))}
            </div>
            {me.hand.length >= 7 && (
              <button type="button" className="hand-more" onClick={() => setHandOpen(true)}>
                手札 {me.hand.length}枚を広げる
              </button>
            )}
          </div>

          <div className="col-right">
            <div className="peek">
              {peekCard ? (
                <PeekCard key={peekCard.id} card={peekCard} view={peek?.view} onOpen={() => setZoom(peek)} />
              ) : (
                <p className="muted">カードを押すと、ここに表示します。長押しで画面いっぱいに拡大</p>
              )}
            </div>
            <button
              type="button"
              className={`btn end-turn ${myTurn ? "now" : ""}`}
              onClick={() => setConfirmEnd(true)}
              disabled={!myTurn}
            >
              ターン終了
            </button>
            <details className="log-box">
              <summary>対戦の記録</summary>
              <ol className="log" aria-label="対戦の記録">
                {log
                  .slice()
                  .reverse()
                  .map(({ id, e }) => (
                    <li key={id} className={`ev-${e.type}`}>
                      {describe(e)}
                    </li>
                  ))}
              </ol>
            </details>
            {online && !game.winner && (
              <button
                type="button"
                className={`btn ghost resign ${resignAsk ? "ask" : ""}`}
                onClick={() => (resignAsk ? resign() : setResignAsk(true))}
                onBlur={() => setResignAsk(false)}
              >
                {resignAsk ? "本当に降参する" : "降参"}
              </button>
            )}
            <button type="button" className="btn ghost quit" onClick={quit}>
              {online ? "ロビーに戻る" : "デッキ選択に戻る"}
            </button>
          </div>
        </div>
      </div>
      <p className="rotate-hint">スマホは横向きにすると大きく遊べます</p>

      {drag &&
        (() => {
          // 対象を取る投稿と攻撃は、カードから指先へ矢印を伸ばす（狙う相手が指やカードで隠れないように）
          const handId = drag.src.kind === "hand" ? me.hand[drag.src.index] : undefined;
          const handCard = handId ? CATALOG[handId] : undefined;
          if (
            drag.src.kind === "hand" &&
            handId &&
            handCard &&
            !(handCard.type === "post" && handCard.target)
          ) {
            return (
              <div
                className="drag-ghost"
                aria-hidden="true"
                style={{
                  left: drag.x,
                  top: drag.y,
                  width: drag.width,
                  transform: `translate(-50%, -62%) scale(${stage.scale * 1.08})`,
                }}
              >
                <MiniCard
                  card={handCard}
                  cost={effectiveCost(game, ME, handId, CATALOG)}
                  className="in-hand"
                />
              </div>
            );
          }
          const from = { x: drag.rect.left + drag.rect.width / 2, y: drag.rect.top + drag.rect.height / 2 };
          const [where, n] = (drag.over ?? "").split(":");
          const slot = Number(n);
          const hot =
            drag.src.kind === "unit"
              ? (where === "leader" && canHit({ kind: "leader" })) ||
                (where === "foe" && canHit({ kind: "unit", slot }))
              : (where === "foe" && canCastOn("enemy", slot)) ||
                (where === "ally" && canCastOn("ally", slot));
          const el = hot ? document.querySelector(`[data-drop="${drag.over}"]`) : null;
          const r = el?.getBoundingClientRect();
          const to = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: drag.x, y: drag.y };
          return <AttackArrow from={from} to={to} hot={hot} ally={where === "ally"} />;
        })()}

      {banner && (
        <div
          key={banner.id}
          className={`turn-banner ${banner.mine ? "mine" : "foe"}`}
          aria-hidden="true"
          onAnimationEnd={(e) => e.target === e.currentTarget && setBanner(null)}
        >
          <div className="tb-band">
            <small>TURN {banner.turn}</small>
            <strong>{banner.mine ? "あなたのターン" : "相手のターン"}</strong>
          </div>
        </div>
      )}

      {reveal && CATALOG[reveal.cardId] && (
        <div key={reveal.id} className={`foe-reveal ${reveal.mine ? "mine" : ""}`} aria-live="polite">
          <span className="fr-label">
            {reveal.mine ? "あなたの投稿" : `${foeName}が${reveal.kind === "play" ? "出した" : "投稿した"}`}
          </span>
          <div className="fr-card">
            <HoloCard card={CATALOG[reveal.cardId] as CardDef} idle={false} />
          </div>
        </div>
      )}

      {handOpen && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="手札">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setHandOpen(false)} />
          <div className="sheet-body hand-sheet">
            <h2>手札（{me.hand.length}枚）</h2>
            <div className="hand-grid">{me.hand.map((id, i) => handCard(id, i, true))}</div>
            <button type="button" className="btn ghost" onClick={() => setHandOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {confirmEnd && myTurn && (
        <EndTurnConfirm
          attackers={me.field.filter((u) => u && canUnitAttack(game, u)).length}
          mana={me.mana}
          onYes={() => {
            setConfirmEnd(false);
            endTurn();
          }}
          onNo={() => setConfirmEnd(false)}
        />
      )}
      {cut && CATALOG[cut.cardId] && (
        <DarkCutscene
          key={cut.id}
          card={CATALOG[cut.cardId] as CardDef}
          mine={cut.mine}
          ownerName={cut.mine ? "あなた" : foeName}
          onDone={() => {
            cut.done();
            setCut(null);
          }}
        />
      )}
      {zoom && CATALOG[zoom.id] && (
        <CardZoom card={CATALOG[zoom.id] as CardDef} view={zoom.view} onClose={() => setZoom(null)} />
      )}

      {trashView && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="オワコン">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setTrashView(null)} />
          <div className="sheet-body trash-list">
            <h2>
              {trashView === ME ? "あなた" : foeName}のオワコン（{game.players[trashView].trash.length}枚）
            </h2>
            {trashView === ME && myDark.length > 0 && freeSlot >= 0 && (
              <div className="dark-pick">
                <p>闇堕ちの姿で、コストなしで出せます（出たターンは攻撃できません）</p>
                <div className="dark-pick-row">
                  {myDark.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="btn dark-pick-btn"
                      onClick={() => {
                        setTrashView(null);
                        select({ kind: "dark", cardId: id });
                      }}
                    >
                      {nameOf(id)} を闇堕ちさせる
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="trash-grid">
              {game.players[trashView].trash.map((id, i) => {
                const c = CATALOG[id];
                if (!c) return null;
                return (
                  <MiniCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが複数あり得るので位置で区別する
                    key={`${id}-${i}`}
                    card={c}
                    className="in-trash"
                    onClick={() => setZoom({ id, where: "trash", index: i })}
                  />
                );
              })}
            </div>
            <button type="button" className="btn ghost" onClick={() => setTrashView(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {game.winner && (
        <Result game={game} onAgain={online ? undefined : () => start(deck)} onQuit={quit} online={online} />
      )}
    </div>
  );
}

/** 大きく表示するカード。場のアイコンなら今の状態（闇堕ち・ダメージ・強化）も添える */
function PeekCard({ card, view, onOpen }: { card: CardDef; view?: UnitView; onOpen: () => void }) {
  const dark = view?.unit.dark && card.dark;
  return (
    <>
      {/* 押すと画面いっぱいに拡大して、効果を大きな文字で読める */}
      <div className={dark ? "peek-dark" : undefined}>
        <HoloCard card={card} darkForm={!!dark} interactive idle={false} onClick={onOpen} />
      </div>
      <button type="button" className="btn ghost peek-zoom" onClick={onOpen}>
        大きく見る
      </button>
      {view && (
        <div className="peek-note">
          {dark && <b className="peek-darkname">闇堕ち：{card.dark?.name}</b>}
          <span>
            攻撃 <b className="t-atk">{view.attack}</b>・体力 <b className="t-hp">{view.hp}</b>/{view.maxHp}
          </span>
          {view.keywords.length > 0 && <span>{view.keywords.join("・")}</span>}
          {view.exposed && <span>晒し者（ガードを無視して攻撃される）</span>}
          {view.asleep && <span>眠っている（このターンは攻撃できない）</span>}
          {view.unit.silenced && <span>訂正済み（キーワードと効果が消えている）</span>}
        </div>
      )}
      {!view && card.dark && <p className="peek-note">闇堕ちの姿は、闇堕ちするまで分からない</p>}
      {!view && (
        <div className="peek-chips">
          <AttrChips card={card} />
        </div>
      )}
    </>
  );
}

function Result({
  game,
  onAgain,
  onQuit,
  online,
}: {
  game: GameState;
  onAgain?: () => void;
  onQuit: () => void;
  online: boolean;
}) {
  return (
    <div className="result" role="dialog" aria-modal="true" aria-label="対戦結果">
      <div className={`result-card ${game.winner === ME ? "win" : "lose"}`}>
        <strong>{game.winner === ME ? "勝利！" : "敗北…"}</strong>
        <span>{game.turn} ターン目で決着</span>
        <div className="result-actions">
          {onAgain && (
            <button type="button" className="btn" onClick={onAgain}>
              もう一度
            </button>
          )}
          <button type="button" className={onAgain ? "btn ghost" : "btn"} onClick={onQuit}>
            {online ? "ロビーに戻る" : "デッキを選び直す"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 山札（裏向きの束）とオワコン（いちばん上のカード）。オワコンを押すと一覧を出す */
function Piles({
  owner,
  deck,
  trash,
  onTrash,
  dark,
}: {
  owner: PlayerId;
  deck: number;
  trash: string[];
  onTrash: () => void;
  /** オワコンに闇堕ちできるカードがある（mine＝今出せる／foe＝相手が出してくるかも） */
  dark?: "mine" | "foe";
}) {
  const top = trash.at(-1);
  const topCard = top ? CATALOG[top] : null;
  return (
    <div className="piles">
      <div className="pile" data-pile={`deck-${owner}`} title={`山札 ${deck}枚`}>
        <span className={`cardback depth-${Math.min(3, Math.ceil(deck / 5))} ${deck === 0 ? "empty" : ""}`} />
        <b className="pile-count">{deck}</b>
        <small>山札</small>
      </div>
      <button
        type="button"
        className={`pile ${dark ? `dark-ready ${dark}` : ""}`}
        data-pile={`trash-${owner}`}
        onClick={onTrash}
        disabled={trash.length === 0}
        aria-label={`オワコン ${trash.length}枚を見る`}
      >
        {topCard ? (
          <span
            className="trash-top"
            style={
              topCard.art
                ? { backgroundImage: `url(${topCard.art})` }
                : { background: ATTR_META[topCard.attributes[0] ?? "草"].deep }
            }
          >
            <i>{topCard.name}</i>
          </span>
        ) : (
          <span className="trash-empty" />
        )}
        <b className="pile-count">{trash.length}</b>
        <small>{dark === "mine" ? "闇堕ち" : "オワコン"}</small>
      </button>
    </div>
  );
}

interface BarProps {
  side: "me" | "foe";
  name: string;
  lp: number;
  mana: number;
  maxMana: number;
  hand: number;
  active: boolean;
  /** 場にガードがいてマスターを攻撃できない */
  guarded?: boolean;
  targetable?: boolean;
  /** ドラッグした攻撃が、いまこのマスターの上にある */
  dropOver?: boolean;
  /** 攻撃したときの見込み */
  preview?: AttackPreview | null;
  onClick?: () => void;
  piles: React.ReactNode;
  children?: React.ReactNode;
}

function PlayerBar({
  side,
  name,
  lp,
  mana,
  maxMana,
  hand,
  active,
  guarded,
  targetable,
  dropOver,
  preview,
  onClick,
  piles,
  children,
}: BarProps) {
  const pct = Math.max(0, Math.min(100, (lp / 20) * 100));
  const pips = Array.from({ length: Math.max(maxMana, mana) }, (_, i) => i < mana);
  const body = (
    <>
      <span className="pb-name">
        {name}のマスター
        {active && <i className="turn-dot" title="この人のターン" />}
        {guarded && <span className="pb-guard">ガードで守られている</span>}
      </span>
      <span className="pb-lp">
        ライフ <b key={lp}>{lp}</b>
        <span className="lp-bar">
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="pb-mana" title={`話題力 ${mana} / ${maxMana}`}>
        話題力
        <span className="pips">
          {pips.map((on, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 話題力の玉は位置そのものが意味を持つ
            <i key={i} className={on ? "on" : ""} />
          ))}
        </span>
        <b>
          {mana}/{maxMana}
        </b>
      </span>
      <span className="pb-count">
        <span data-hand={side === "me" ? undefined : CPU}>手札 {hand}</span>
      </span>
      {preview && <AttackBadge pv={preview} leader />}
    </>
  );
  return (
    <div className={`pbar ${side}`}>
      {onClick ? (
        <button
          type="button"
          data-master={side === "me" ? ME : CPU}
          data-drop={side === "foe" ? "leader" : undefined}
          className={`pb-main ${active ? "active" : ""} ${targetable ? "targetable" : ""} ${dropOver ? "drop-over" : ""}`}
          disabled={!targetable}
          onClick={onClick}
          aria-label={`${name}のマスターを攻撃`}
        >
          {body}
        </button>
      ) : (
        <div className={`pb-main ${active ? "active" : ""}`} data-master={side === "me" ? ME : CPU}>
          {body}
        </div>
      )}
      {piles}
      {children}
    </div>
  );
}
