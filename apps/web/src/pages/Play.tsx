import { type CardDef, type DeckId } from "@trends/cards";
import {
  type AttackPreview,
  type AttackTarget,
  applyAction,
  attackTargets,
  buzzBlock,
  type CastTarget,
  canUnitAttack,
  castTargets,
  DEFAULT_CONFIG,
  darkOmens,
  delayedDamageOn,
  effectiveCost,
  fieldOf,
  type GameEvent,
  type GameState,
  isShielded,
  type PlayerId,
  previewAttack,
  SLOTS,
  sacrificeCandidates,
  type Unit,
  type UnitView,
  viewUnit,
} from "@trends/game-core";
import { gsap } from "gsap";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import { EffectText, HelpTerm } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { frameRect, frameSize } from "../frame";
import { fieldEntry, landed } from "../fx/fieldEntry";
import { fxEnabled } from "../fx/stage";
import { warmFx } from "../fx/warm";
import { ArbiterField } from "../game/ArbiterField";
import { CardZoom } from "../game/CardZoom";
import { type DarkCut, DarkCutscene } from "../game/DarkCutscene";
import { DirectorField, type StagedAce } from "../game/DirectorField";
import { useDecksChanged } from "../game/deckSync";
import {
  builtinDeck,
  customDeckSel,
  type DeckSel,
  deckErrors,
  deckFromRef,
  loadCustomDecks,
} from "../game/decks";
import { FixerField, type FixerHandle } from "../game/FixerField";
import {
  animateAttack,
  animateBuzz,
  animateDraw,
  animateEffects,
  animateJudge,
  animateSacrifice,
  flipCard,
  hasVisibleEffects,
  markBuzzed,
  popDamage,
  popMaster,
  retireUnits,
} from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { CATALOG, CPU, DECK_INFO, ME, openingMs, setPresenter, useGame } from "../game/store";
import { useDragPlay } from "../game/useDragPlay";
import { type ClockLeft, formatClock, useClockLeft, useLive } from "../online/live";
import { lockZoom, resetZoom } from "../viewport";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 演出（GSAP）と同じ時計で待つ。着地などの GSAP の動きに間合いを合わせたいところで使う */
const gwait = (ms: number) => new Promise<void>((r) => gsap.delayedCall(ms / 1000, r));
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
    case "revived":
      return `${who(e.player)}の ${nameOf(e.cardId)} が、オワコンから場に戻った（蘇生）`;
    case "transformed":
      return `${who(e.player)}の ${nameOf(e.cardId)} が ${nameOf(e.into)} になった（ネタにされた）`;
    case "battle": {
      const lost = e.destroyed.map(nameOf).join("・");
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}：${e.toDefender} ダメージ、反撃 ${e.toAttacker}${lost ? `（オワコン：${lost}）` : ""}`;
    }
    case "damaged":
      return `${nameOf(e.cardId)} に ${e.amount} ダメージ`;
    case "destroyed":
      return e.vanished
        ? `${who(e.player)}の ${nameOf(e.cardId)}（闇堕ちの姿）が消えた`
        : `${who(e.player)}の ${nameOf(e.cardId)} がオワコンになった`;
    case "darkOmen":
      return `${who(e.player)}の ${nameOf(e.cardId)} がオワコンになった……闇の気配。次の${who(e.player)}のターンの始めに闇堕ちして戻ってくる`;
    case "darkFall":
      return `${who(e.player)}の ${nameOf(e.cardId)} が、闇堕ちして戻ってきた！`;
    case "buzz":
      return `${who(e.player)}：${nameOf(e.cardId)} がバズった！ 攻撃力+${e.attack}・体力+${e.hp}・凸（バズ 残り${e.left}）`;
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
    case "burned":
      return `${who(e.player)}の手札がいっぱいで、引いた ${nameOf(e.cardId)} はオワコンへ`;
    case "deckOut":
      return `${who(e.player)}の山札が切れた`;
    case "sacrificeAsk":
      return "『フィクサー』：自分と相手は、それぞれ自分のアイコンを1体差し出す";
    case "sacrificed":
      return `${who(e.player)}の ${nameOf(e.cardId)} が差し出された`;
    case "specialWin":
      return `${who(e.player)}の山札が切れた。陰謀論者「これは世界のせいだ」──特殊勝利`;
    case "turnStarted":
      return `―― ${e.turn}ターン目：${who(e.player)}（話題力 ${e.mana}）――`;
    case "stolen":
      return `${who(e.player)}が ${nameOf(e.cardId)} を奪った（推し変）`;
    case "bounced":
      return `${who(e.player)}の ${nameOf(e.cardId)} が手札に戻された`;
    case "shield":
      return e.kind === "shielded"
        ? `${who(e.player)}のマスターは、次の相手のターンが終わるまでダメージを受けない`
        : `${who(e.player)}のマスターへの ${e.amount} ダメージを防いだ`;
    case "delayedDamageSet":
      return `${who(e.player)}のマスターに、${nameOf(e.cardId)} の「次の自分のターンの終わりに${e.amount}ダメージを受ける」効果が付いた`;
    case "delayedDamageFired":
      return `${who(e.player)}のマスターに付いていた ${nameOf(e.cardId)} の効果が働いた`;
    case "extraTurn":
      return `${who(e.player)}は、このあともう一度ターンを行う`;
    case "resigned":
      return `${who(e.player)}が降参した`;
    case "timedOut":
      return `${who(e.player)}の持ち時間が切れた`;
    case "won":
      return `${who(e.player)}の勝ち`;
  }
}

/**
 * 対戦画面は「舞台」を作って、画面に合わせて拡大・縮小する。画面はスマホの縦の舞台1つだけ
 * （PC やスマホの横持ちでも同じ舞台を、収まる大きさで中央に置く。2つの画面を保守しないため）
 * - 切り欠き・ホームバー（セーフエリア）を除いた範囲に収める
 * - 幅 390。高さは画面の縦横比に合わせて 740〜860（横長の画面では 860）
 * - 場の枠は横幅から（5 枠が横いっぱい）、手札の大きさは舞台の高さから決める
 */
const PORTRAIT_W = 390;
const PORTRAIT_H_MIN = 740;
const PORTRAIT_H_MAX = 860;
/** 縦の舞台の左右の余白と、枠どうしの間（pstage の CSS と合わせる） */
const PORTRAIT_PAD = 6;
const PORTRAIT_GAP = 5;
const fitPortraitSlot = (width: number) => Math.floor((width - PORTRAIT_PAD * 2 - PORTRAIT_GAP * 4) / 5);
/** 縦の舞台の手札の幅：舞台が高いほど大きく持つ（場2段・マスター2つ・説明の帯を引いた残りから） */
const fitHand = (height: number) => Math.max(84, Math.min(124, Math.floor((height - 600) * 0.6)));

export interface Stage {
  width: number;
  height: number;
  scale: number;
  slot: number;
  cx: number;
  cy: number;
  /** 手札のカードの幅 */
  hand: number;
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
  // 横長の画面（PC・スマホの横持ち）はスマホの縦画面と同じ高さ（860）にする
  const height =
    w >= h ? PORTRAIT_H_MAX : Math.min(PORTRAIT_H_MAX, Math.max(PORTRAIT_H_MIN, (PORTRAIT_W * h) / w));
  return {
    width: PORTRAIT_W,
    height,
    scale: Math.min(w / PORTRAIT_W, h / height),
    slot: fitPortraitSlot(PORTRAIT_W),
    cx: safe.l + w / 2,
    cy: safe.t + h / 2,
    hand: fitHand(height),
  };
}

function useStage() {
  const probe = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>(() => measureStage(PORTRAIT_W, PORTRAIT_H_MAX));
  useLayoutEffect(() => {
    // 拡大の影響を受けない大きさで測る（iPhone で拡大されても舞台が縮まない）
    const on = () => {
      // 画面の枠（スマホの縦の画面。frame.ts）の大きさで測る。PC でも枠の中だけに舞台を置く
      const { width, height } = frameSize();
      setStage(measureStage(width, height, safeArea(probe.current)));
    };
    on();
    // iPhone は向きを変えた直後のサイズが古い・倍率が 1 でなくなることがあるので、少し後に戻して測り直す
    const later = () =>
      setTimeout(() => {
        resetZoom();
        on();
      }, 300);
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", later);
    // 対戦中はピンチ拡大を止める
    const unlock = lockZoom();
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", later);
      unlock();
    };
  }, []);
  return { stage, probe };
}

export function Play() {
  const deck = useGame((s) => s.deck);
  return <section className="page play">{deck ? <Board /> : <DeckSelect />}</section>;
}

function DeckSelect() {
  const start = useGame((s) => s.start);
  // デッキを選んでいる間（何も動いていないとき）に、演出の舞台を用意しておく
  useEffect(() => warmFx(600), []);
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
            話題力は毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。手札は先攻 3 枚・後攻 4 枚で始め、9
            枚まで（いっぱいのときに引いたカードはオワコンへ）。後攻は最初のターンだけ話題力 +1
          </li>
          <li>
            アイコンは場に 5 体まで出せる。出したターンは攻撃できない（速攻を除く）。投稿は使い切りの効果
          </li>
          <li>
            アイコン同士で戦うと、お互いの<b className="t-atk">攻撃力</b>の分だけ相手の
            <b className="t-hp">体力</b>
            が減る。体力が 0 になったアイコンはオワコンへ。受けたダメージは残る
          </li>
          <li>相手の場にガードがいる間は、ガードしか攻撃できない。晒し者になるとガードを失う</li>
          <li>
            闇堕ちを持つ★5は、オワコンになったら次の自分のターンの始めに、闇堕ちの姿で自動で戻ってくる（出たターンは相手のアイコンにだけ攻撃できる）。闇堕ちの姿がオワコンになったら消える
          </li>
          <li>
            バズ：1試合に2回（自分の4ターン目から。後攻は3ターン目から）、自分のアイコン1体に攻撃力+2・体力+2と凸
          </li>
        </ul>
      </details>
    </>
  );
}

/**
 * デッキ選択のサムネのエース：背景の絵をうっすら敷き、切り抜き（あれば）を右に大きく出す。
 * 文字は左に置くので、左から右へ暗さを抜くグラデーションを重ねて読みやすくする
 */
/** オープニングで見せる相手のデッキ。自分で組んだデッキは中身の名前を出さず「オリジナルデッキ」に */
function foeDeckSel(ref: string | null): DeckSel {
  const sel = ref ? deckFromRef(ref) : null;
  if (!sel) return { ref: ref ?? "", name: "相手のデッキ", text: "", cards: [], attrs: [] };
  return ref?.startsWith("custom:") ? { ...sel, name: "オリジナルデッキ" } : sel;
}

/**
 * 対戦の始めのオープニング。画面を斜めに切り分け、上に相手・下に自分のデッキ（色・属性・エース）を
 * 点対称に並べ、まん中に VS だけを出す。どちらの画面でも自分が下になるので、両者で同じ見え方になる
 */
function Opening({
  me,
  foe,
  foeName,
  ms,
  onDone,
}: {
  me: DeckSel;
  foe: DeckSel;
  foeName: string;
  ms: number;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (
    <div
      className="opening"
      style={{ "--op-ms": `${ms}ms` } as CSSProperties}
      role="status"
      aria-label={`${foeName}「${foe.name}」対 あなた「${me.name}」。バトルスタート`}
    >
      <OpeningSide side="foe" sel={foe} who={foeName} />
      <OpeningSide side="me" sel={me} who="あなた" />
      <svg className="op-slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="-2" y1="61.2" x2="102" y2="38.8" />
      </svg>
      <span className="op-vs" aria-hidden="true">
        VS
      </span>
    </div>
  );
}

function OpeningSide({ side, sel, who }: { side: "me" | "foe"; sel: DeckSel; who: string }) {
  const ace = sel.ace ? CATALOG[sel.ace] : undefined;
  const subject = ace ? aceSubject(ace) : undefined;
  return (
    <div className={`op-side ${side}`} style={{ background: deckGradient(sel.attrs, sel.ace) }}>
      {ace?.art && <span className="op-bg" style={{ backgroundImage: `url(${ace.art})` }} />}
      {subject && (
        <img
          className="op-ace"
          src={subject}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="op-info">
        <span className="op-who">{who}</span>
        <strong className="op-name">{sel.name}</strong>
        <span className="op-attrs">
          {sel.attrs.length === 0 ? (
            <span className="op-attr common">共通</span>
          ) : (
            sel.attrs.map((a) => (
              <span
                key={a}
                className="op-attr"
                style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}
              >
                <i aria-hidden="true">{ATTR_META[a].mark}</i>
                {a}
              </span>
            ))
          )}
        </span>
      </div>
    </div>
  );
}

/** エースの切り抜き。専用のカード面を持つ★5は、カードデータに切り抜きの指定が無い（面の CSS が直接読む）ので、同じ名前の切り抜きを使う */
function aceSubject(card: CardDef): string | undefined {
  return card.subject ?? (card.rarity === 5 ? card.art?.replace(/-art\.jpg$/, "-subject.webp") : undefined);
}

function DeckAce({ id }: { id?: string }) {
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

/**
 * 盤面の背景。闇堕ちを持つカードがオワコンにされると「予兆」（持ち主の側から紫に染まる）、
 * 闇堕ちの姿が場にいる間は「闇」（盤面全体が暗い闇のフィールドになる）
 */
function FieldLayer({ kind, mine }: { kind: "dark" | "omen"; mine: boolean }) {
  return (
    <div className={`field-layer field-${kind} ${mine ? "mine" : "foe"}`} aria-hidden="true">
      <span className="field-mist" />
      <span className="field-mist m2" />
    </div>
  );
}

/** 闇の気配：オワコンになったエースの枠に灯る紫の炎 */
function OmenFlame() {
  return (
    <span className="omen-flame" aria-hidden="true">
      <i />
      <i />
      <i />
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
function deckGradient(attrs: readonly string[], ace?: string) {
  if (ace && ACE_GRADIENT[ace]) return ACE_GRADIENT[ace];
  const [a, b = a] = attrs.map((x) => ATTR_META[x as keyof typeof ATTR_META]);
  if (!a) return "linear-gradient(125deg, #6b7280, #374151)";
  return `linear-gradient(125deg, ${a.color}, ${a.deep} 50%, ${b?.deep} 50%, ${b?.color})`;
}

/**
 * デッキを選ぶ（CPU 戦とオンライン対戦で共通）。構築済みデッキと、自分で組んで保存したデッキを並べる。
 * confirmLabel を渡すと、押してすぐには決めず、中身を見せて確かめてから onPick する
 * （オンライン対戦は選んだらすぐ部屋ができるので、押し間違いを防ぐ）
 */
export function DeckGrid({
  onPick,
  confirmLabel,
}: {
  onPick: (deck: DeckSel) => void;
  confirmLabel?: string;
}) {
  const [pending, setPending] = useState<DeckSel | null>(null);
  // 決まりを守れていない自分のデッキ（属性が2つの、前に組んだデッキなど）は選べない。デッキ構築で直してもらう
  const readMine = useCallback(() => {
    const all = loadCustomDecks();
    const ok = all.filter((d) => deckErrors(d.cards).length === 0);
    return { mine: ok, broken: all.length - ok.length };
  }, []);
  const [{ mine, broken }, setMine] = useState(readMine);
  // アカウントとそろえ終わったら、自分のデッキを読み直す
  useDecksChanged(useCallback(() => setMine(readMine()), [readMine]));
  const pick = (sel: DeckSel) => (confirmLabel ? setPending(sel) : onPick(sel));
  const button = (sel: DeckSel) => (
    <button
      key={sel.ref}
      type="button"
      className="deck-pick"
      style={{ background: deckGradient(sel.attrs, sel.ace) }}
      onClick={() => pick(sel)}
    >
      <DeckAce id={sel.ace} />
      <span className="deck-attrs">{sel.attrs.length > 0 ? sel.attrs.join(" × ") : "共通"}</span>
      <strong>{sel.name}</strong>
      <span>{sel.text}</span>
    </button>
  );
  return (
    <>
      <div className="deck-section">
        <h2>自分のデッキ</h2>
        <Link to="/decks" className="btn ghost small">
          デッキを組む
        </Link>
      </div>
      <div className="decks">
        {mine.map((d) => customDeckSel(d)).map(button)}
        {broken > 0 && (
          <p className="muted deck-empty">
            決まり（属性は1つ＋共通カード）を守れていないデッキが {broken}{" "}
            個あります。「デッキを組む」で直すと選べます
          </p>
        )}
        {mine.length === 0 && broken === 0 && (
          <p className="muted deck-empty">
            まだありません。「デッキを組む」から、20枚のデッキを自由に作れます
          </p>
        )}
      </div>
      <div className="deck-section">
        <h2>構築済みデッキ</h2>
      </div>
      <div className="decks">
        {(Object.keys(DECK_INFO) as DeckId[]).map((id) => builtinDeck(id)).map(button)}
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
    </>
  );
}

/** デッキの確認（名前・属性・説明と、入っているカード） */
function DeckConfirm({
  deck,
  label,
  onConfirm,
  onCancel,
}: {
  deck: DeckSel;
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
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const list = [...counts]
    .map(([id, n]) => ({ card: CATALOG[id], n }))
    .filter((x): x is { card: CardDef; n: number } => !!x.card)
    .sort((x, y) => y.card.rarity - x.card.rarity || x.card.cost - y.card.cost);
  return (
    <div className="zoom-sheet deck-confirm" role="dialog" aria-modal="true" aria-label="デッキの確認">
      <button type="button" className="zoom-sheet-bg" aria-label="選び直す" onClick={onCancel} />
      <div className="deck-confirm-body">
        <div className="deck-confirm-head" style={{ background: deckGradient(deck.attrs, deck.ace) }}>
          <span className="deck-attrs">{deck.attrs.length > 0 ? deck.attrs.join(" × ") : "共通"}</span>
          <strong>{deck.name}</strong>
          <span>{deck.text}</span>
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

/** バズの確認：対象のアイコンと、バズしたあとの攻撃力・体力・残りの回数を見せる */
function BuzzConfirm({
  card,
  view,
  left,
  onYes,
  onNo,
}: {
  card: CardDef;
  view: UnitView;
  left: number;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);
  return (
    <div
      className="zoom-sheet end-confirm buzz-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-label="バズの確認"
    >
      <button type="button" className="zoom-sheet-bg" aria-label="やめる" onClick={onNo} />
      <div className="end-confirm-body">
        <div className="bzc-head">
          {card.art && <span className="bzc-art" style={{ backgroundImage: `url(${card.art})` }} />}
          <div>
            <p className="end-confirm-q">{card.name}をバズらせますか？</p>
            <p className="bzc-stats">
              <span className="atk">
                攻撃力 {view.attack} → <b>{view.attack + DEFAULT_CONFIG.buzzAttack}</b>
              </span>
              <span className="hp">
                体力 {view.hp} → <b>{view.hp + DEFAULT_CONFIG.buzzHp}</b>
              </span>
              <span>凸が付く</span>
            </p>
          </div>
        </div>
        <p className="bzc-left">
          残り {left} 回 → {Math.max(0, left - 1)} 回
        </p>
        <div className="end-confirm-actions">
          <button type="button" className="btn ghost" onClick={onNo}>
            やめる
          </button>
          <button type="button" className="btn buzz-btn bzc-go" onClick={onYes}>
            バズらせる
          </button>
        </div>
      </div>
    </div>
  );
}

type Peek = {
  id: string;
  view?: UnitView;
  where: "hand" | "mine" | "foe" | "trash";
  index: number;
  /** 最初から闇堕ちの姿で開く（オワコンから闇堕ちさせる前の確認用） */
  dark?: boolean;
};

/** ドラッグしているもの（手札のカード／攻撃するアイコン） */
type DragSrc = { kind: "hand"; index: number } | { kind: "unit"; slot: number };

/** 攻撃したときの見込み（与えるダメージ・オワコンにできるか）を、攻撃先に重ねて出す */
function AttackBadge({ pv, leader }: { pv: AttackPreview; leader?: boolean }) {
  const tag = leader
    ? pv.kills && "とどめ"
    : pv.kills && pv.dies
      ? "相打ち"
      : pv.kills
        ? "オワコン"
        : pv.dies
          ? "返り討ち"
          : null;
  return (
    <span className={`atk-pv ${pv.kills ? "kill" : ""}`} aria-hidden="true">
      <b>-{pv.toDefender}</b>
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
/** 見せ終わったオープニングの番号（store の opening） */
let openingSeen = 0;

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
    sacrifice,
    buzz,
    start,
    quit: quitGame,
    mode,
    foeName,
    foeDeckRef,
    opening,
    resign,
  } = useGame();
  const online = mode === "online";
  // オンライン対戦の持ち時間（CPU 戦では null）
  const myClock = useClockLeft(ME, game?.active ?? ME);
  const foeClock = useClockLeft(CPU, game?.active ?? ME);
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
  const [peek, setPeek] = useState<Peek | null>(null);
  /** 画面いっぱいに大きく見ているカード（スマホで効果を読むため） */
  const [zoom, setZoom] = useState<Peek | null>(null);
  const [banner, setBanner] = useState<{ id: number; mine: boolean; turn: number } | null>(null);
  /** 『フィクサー』の登場：バトル場が黒に滲む（出したターンが終わるまで続く） */
  const [fixer, setFixer] = useState<{ id: number } | null>(null);
  const fixerApi = useRef<FixerHandle>(null);
  /** 『調停者』の登場：刃を振るう間、バトル場が青のフィールドになる */
  const [arbiter, setArbiter] = useState<{ id: number; leaving: boolean } | null>(null);
  /** 『演出家』の登場：バトル場全体の背景を真紅と黒の二色が支配する */
  const [director, setDirector] = useState<{ id: number; aces: StagedAce[] } | null>(null);
  /** 『演出家』で舞台に上がるエース。ふつうの着地の代わりに、血の滴とクラウンで見せる（DirectorField が動かす） */
  const stagedAces = useRef(new Set<number>());
  const [trashView, setTrashView] = useState<PlayerId | null>(null);
  /** 対戦の記録（縦の舞台では下から出る一覧） */
  const [logOpen, setLogOpen] = useState(false);
  const seen = useRef(0);
  /** 見せ終わったオープニング（画面を作り直しても、同じ対戦で見せ直さない） */
  const [openSeen, setOpenSeen] = useState(openingSeen);
  // テストなど、オープニングの長さが 0 のときは見せない
  const openingOn = opening > openSeen && openingMs() > 0;
  const foeDeck = useMemo(() => foeDeckSel(foeDeckRef), [foeDeckRef]);
  /** マスターへの攻撃が当たった瞬間に先に見せたライフ（state が進むまでの間の表示）。同じ出来事の数字を二重に出さないためにも使う */
  const [lpHit, setLpHit] = useState<{ player: PlayerId; lp: number } | null>(null);
  const hitShown = useRef<{ player: PlayerId; lp: number } | null>(null);
  // 攻撃のあと state が進んだら、本当のライフの表示に戻す
  // biome-ignore lint/correctness/useExhaustiveDependencies: game が変わったときだけ戻す
  useEffect(() => setLpHit(null), [game]);
  const { stage, probe } = useStage();
  /** ターン終了の確認を出しているか（押し間違いで終わらないように） */
  const [confirmEnd, setConfirmEnd] = useState(false);
  /** バズの確認を出している自分のアイコンの枠（アイコンを選んでからバズを押すと出る） */
  const [buzzAsk, setBuzzAsk] = useState<number | null>(null);
  /** バズが使えるようになった回数。増えるたびに、ボタンの枠の光を右回りに走らせる */
  const [buzzWake, setBuzzWake] = useState(0);
  const buzzWas = useRef(false);

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

  // 演出の舞台（PixiJS）を先に用意して温めておく（最初の演出で読み込み待ち・一瞬の停止にならないように）。
  // 用意する間は画面が少し止まるので、対戦開始の VS の演出が終わってから、手が空いたときに行う（fx/warm.ts）
  useEffect(() => {
    if (openingOn) return;
    return warmFx();
  }, [openingOn]);

  // 闇堕ちの字の書体を先に読み込んでおく（初めての闇堕ちで、別の書体のまま出ないように）
  useEffect(() => {
    void document.fonts?.load('400 1em "Zen Antique"', "闇堕ち").catch(() => {});
  }, []);

  // 開発中だけ、闇堕ちの演出とカードの拡大をブラウザから出せるようにする（演出の確認用）
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __playFx?: unknown }).__playFx = {
      darkFall: (cardId: string, mine = true) => setCut({ id: Date.now(), cardId, mine, done: () => {} }),
      zoom: (id: string) => setZoom({ id, where: "hand", index: 0 }),
    };
  }, []);

  // 攻撃の演出を store に登録する（演出が終わってから state を進める）
  useEffect(() => {
    setPresenter({
      beforeAttack: (g, a) => {
        // マスターへの攻撃は、当たった瞬間にライフの表示を減らす（演出のあとでもう一度減ったように見せない）
        const foeId: PlayerId = a.player === ME ? CPU : ME;
        let lp: number | undefined;
        if (a.target.kind === "leader") {
          try {
            lp = applyAction(g, a, CATALOG).state.players[foeId].lp;
          } catch {
            lp = undefined;
          }
        }
        return animateAttack(g, a.player, a.from, a.target, CATALOG, {
          onImpact: () => {
            if (lp === undefined || lp === g.players[foeId].lp) return;
            hitShown.current = { player: foeId, lp };
            setLpHit({ player: foeId, lp });
          },
        });
      },
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
            const f = frameRect();
            const from = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
            await animateEffects(shown, events, next, { from, tint });
          }
        } else if (a.type === "play") {
          const does = (x: string) => !!card?.effects.some((f) => f.do === x);
          const uid = next.players[a.player].field[a.slot]?.uid;
          // 出たアイコンが着地した瞬間から、運営サイドの演出を始める
          const touch = () => (uid !== undefined ? landed(uid) : wait(320));
          if (does("stageAces")) {
            // 『演出家』：着地と同時に舞台が二色になり、0.4 秒たってから出した側のエース、その 0.5 秒あとに相手のエースが、
            // 血の滴とクラウンで舞台に上がる（この Promise が終わると盤面が進む。エースは DirectorField が見せるまで隠しておく）
            await touch();
            const aces: StagedAce[] = events.flatMap((e) => {
              if (e.type !== "summoned") return [];
              const ace = next.players[e.player].field[e.slot];
              return ace ? [{ uid: ace.uid, at: e.player === a.player ? 400 : 900 }] : [];
            });
            if (fxEnabled()) for (const s of aces) stagedAces.current.add(s.uid);
            setDirector({ id: Date.now(), aces });
            await gwait(400);
            return;
          }
          if (does("sacrifice")) {
            // 『フィクサー』：場が黒に滲み始めてから、差し出しを選ぶ
            await touch();
            setFixer({ id: Date.now() });
            await gwait(900);
            return;
          }
          if (does("judge")) {
            // 『調停者』：着地と同時に場が青のフィールドになり、0.1 秒後に引きの溜めから対象へ光線で突く
            await touch();
            const id = Date.now();
            setArbiter({ id, leaving: false });
            await animateJudge(shown, events, next, uid);
            setArbiter((x) => (x?.id === id ? { id, leaving: true } : x));
            return;
          }
          if (!visible) return;
          await wait(560); // 出たアイコンが場に着いて弾むのを待ってから、効果を出す
          const from = uid !== undefined ? document.querySelector<HTMLElement>(`[data-uid="${uid}"]`) : null;
          await animateEffects(shown, events, next, { from, tint });
        } else if (a.type === "sacrifice") {
          // 差し出しが決まった：選ばれたアイコンを、真上で溜めた黒い閃光で貫く（黒い場はターンが終わるまで残す）
          const uids = events.flatMap((e) =>
            e.type === "sacrificed" ? [shown.players[e.player].field[e.slot]?.uid ?? -1] : [],
          );
          if (uids.length === 0) return;
          const pierced = await animateSacrifice(shown, events, ME);
          // 貫いたアイコンはオワコンへ送り終えているので、残りのいなくなるアイコンだけを送る
          const left: GameState = pierced
            ? {
                ...shown,
                players: {
                  p1: {
                    ...shown.players.p1,
                    field: shown.players.p1.field.map((u) => (u && uids.includes(u.uid) ? null : u)),
                  },
                  p2: {
                    ...shown.players.p2,
                    field: shown.players.p2.field.map((u) => (u && uids.includes(u.uid) ? null : u)),
                  },
                },
              }
            : shown;
          if (visible) await animateEffects(left, events, next, { from: null });
          else retireUnits(left, events, next);
        } else if (visible) {
          await animateEffects(shown, events, next, { from: null });
        }
      },
      buzz: (g, a) => {
        // 言葉は出さず、キャラの絵 → 赤い光の筋 → 「+2」。数字を変える瞬間に state を進める
        const u = g.players[a.player].field[a.slot];
        if (!u) return Promise.resolve();
        const card = CATALOG[u.cardId];
        const art = u.dark ? (card?.dark?.art ?? card?.art) : card?.art;
        return animateBuzz(u.uid, { art, attack: DEFAULT_CONFIG.buzzAttack, hp: DEFAULT_CONFIG.buzzHp });
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

  // アイコンが場に新しく現れたら、その場で着地の演出（溜め → 叩きつけ → 衝撃 → 余韻）。
  // 出来事（ログ）ではなく画面に現れた時点で動かすので、登場時の効果より先に着地する
  // （効果があるとき、store は出したアイコンだけを先に置いた盤面を見せてから効果を見せる）
  const onField = useRef<Set<number> | null>(null);
  useLayoutEffect(() => {
    if (!game) {
      onField.current = null;
      return;
    }
    const now = new Set<number>();
    const fresh: Unit[] = [];
    for (const p of [ME, CPU] as const)
      for (const u of game.players[p].field) {
        if (!u) continue;
        now.add(u.uid);
        if (onField.current && !onField.current.has(u.uid)) fresh.push(u);
      }
    onField.current = now;
    for (const u of fresh) {
      const card = CATALOG[u.cardId];
      const el = document.querySelector<HTMLElement>(`[data-uid="${u.uid}"]`);
      if (stagedAces.current.delete(u.uid)) {
        // 『演出家』で上がるエースは、描かれる前に隠して、血の滴とクラウンに任せる
        if (el) el.style.opacity = "0";
      } else if (card) fieldEntry(el, card);
    }
  }, [game]);

  // 新しい出来事に合わせて演出を出す（ターン開始のバナー・ドロー・効果の数字・闇堕ち）
  useLayoutEffect(() => {
    // オープニングの間は、ターン開始のバナーなどを出さずに待つ（終わったら続きから出す）
    if (openingOn) return;
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
        // 『フィクサー』の黒い場は、出したターンが終わったら滲んで戻る
        fixerApi.current?.close();
        setBanner({ id, mine: e.player === ME, turn: e.turn });
        t += 950;
      } else if (e.type === "drew") {
        void animateDraw(e.player, t);
        t += 180;
      } else if (e.type === "leaderHealed") {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `+${amount}`, "heal"), t);
      } else if (e.type === "leaderDamaged" && !fresh.some((l) => l.e.type === "battle")) {
        // マスターへの攻撃のダメージは、当たった瞬間に見せ終わっている
        const shown = hitShown.current;
        if (shown && shown.player === e.player && shown.lp === e.lp) {
          hitShown.current = null;
          continue;
        }
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `-${amount}`, "dmg"), t);
      } else if (e.type === "damaged") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => popDamage(uid, e.amount), t);
      } else if (e.type === "buzz") {
        // バズで数字が変わった瞬間に、攻撃力・体力の丸を軽く弾ませる
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => markBuzzed(uid), t);
      } else if (e.type === "darkFall" || e.type === "restored") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
      }
    }
  }, [log, openingOn]);

  // バズが使えるようになったら（自分のターンの始め・4ターン目になったとき）、ボタンの枠を光らせる。
  // 演出中・CPU の思考中の出入りでは光らせ直さないよう、盤面の状態だけで見る
  const buzzOpen = !!game && game.active === ME && !game.winner && !game.pending && !buzzBlock(game, ME);
  useEffect(() => {
    if (buzzOpen && !buzzWas.current) setBuzzWake((k) => k + 1);
    buzzWas.current = buzzOpen;
  }, [buzzOpen]);

  if (!game || !deck) return null;
  const me = game.players[ME];
  const foe = game.players[CPU];
  // 差し出し待ち（『フィクサー』）の間は、ほかの操作はできない
  const myTurn = game.active === ME && !game.winner && !cpuBusy && !animating && !game.pending;
  const sacSlots = game.pending?.waiting.includes(ME) ? sacrificeCandidates(game, ME) : [];
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
  const buzzing = selection?.kind === "buzz";
  const buzzWhy = buzzBlock(game, ME);
  const canBuzz = myTurn && !buzzWhy;
  // バズの対象：いま選んでいる自分のアイコン（攻撃のために選んだもの・押して説明を出したもの）
  const buzzTarget = (() => {
    if (attacking) return selection.slot;
    if (peek?.where !== "mine") return null;
    const u = me.field[peek.index];
    return u && u.cardId === peek.id ? peek.index : null;
  })();
  const buzzAskUnit = buzzAsk === null ? undefined : me.field[buzzAsk];
  const omenAt = (owner: PlayerId, slot: number) => darkOmens(game, owner).find((o) => o.slot === slot);
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const preview = (t: AttackTarget) =>
    attacking && canHit(t) ? previewAttack(game, ME, selection.slot, t, CATALOG) : null;
  const foeGuarded = foe.field.some((u) => u && viewUnit(game, CPU, u, CATALOG).guard);
  const peekCard = (peek ? CATALOG[peek.id] : null) ?? null;

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
          onField
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
    const sac = sacSlots.includes(slot);
    return (
      <MiniCard
        key={u.uid}
        uid={u.uid}
        card={card}
        view={view}
        onField
        drop={`ally:${slot}`}
        className={`unit enter ${ready ? "ready" : "tired"} ${buzzing ? "buzz-pick" : ""} ${selected ? "selected" : ""} ${castable ? "targetable ally" : ""} ${sac ? "targetable sac" : ""} ${castable && drag?.over === `ally:${slot}` ? "drop-over" : ""}`}
        onPress={ready ? (e) => begin(e, { kind: "unit", slot }) : undefined}
        onClick={() => {
          if (justDragged()) return;
          if (sac) return sacrifice(slot);
          if (buzzing) {
            setPeek(p);
            return setBuzzAsk(slot);
          }
          if (castable) return cast({ side: "ally", slot });
          if (selected) return select(null);
          setPeek(p);
          if (ready) select({ kind: "attacker", slot });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      >
        {ready && (
          <em className="mini-ready">{u.attacksLeft > 1 ? "2回攻撃可" : u.rushOnly ? "凸" : "攻撃可"}</em>
        )}
      </MiniCard>
    );
  };

  const handCard = (id: string, i: number) => {
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
        className={`in-hand ${usable ? "playable" : "short"} ${selected ? "selected" : ""} ${drag?.src.kind === "hand" && drag.src.index === i ? (card.type === "post" && card.target ? "selected" : "drag-src") : ""}`}
        // 手元で扇のように持つ（真ん中からのずれ）
        style={{ "--f": i - (me.hand.length - 1) / 2 } as CSSProperties}
        onPress={!usable ? undefined : (e) => begin(e, { kind: "hand", index: i })}
        onClick={() => {
          if (justDragged()) return;
          setPeek(p);
          if (!myTurn) return;
          if (selected && card.type === "post" && !card.target) return cast();
          // アイコンは、出す枠を自分で選んだときだけ出す（もう一度押しても勝手に出さず、選ぶのをやめる）
          select(selected ? null : { kind: "hand", index: i });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      />
    );
  };

  // 舞台の部品。横の舞台（3列）と縦の舞台（1列）で同じものを並べ替える
  const foeBar = (
    <PlayerBar
      side="foe"
      name={foeName}
      lp={lpHit?.player === CPU ? lpHit.lp : foe.lp}
      mana={foe.mana}
      maxMana={foe.maxMana}
      hand={foe.hand.length}
      buzz={foe.buzzLeft ?? 0}
      active={game.active === CPU}
      guarded={foeGuarded}
      shielded={isShielded(game, CPU)}
      delayed={delayedDamageOn(game, CPU)}
      targetable={attacking && canHit({ kind: "leader" })}
      dropOver={drag?.over === "leader" && attacking && canHit({ kind: "leader" })}
      preview={preview({ kind: "leader" })}
      onClick={() => !justDragged() && attack({ kind: "leader" })}
      piles={<Piles owner={CPU} deck={foe.deck.length} trash={foe.trash} onTrash={() => setTrashView(CPU)} />}
      clock={online && foeClock && !game.winner ? <ClockChip left={foeClock} /> : null}
    />
  );
  const meBar = (
    <PlayerBar
      side="me"
      name="あなた"
      lp={lpHit?.player === ME ? lpHit.lp : me.lp}
      mana={me.mana}
      maxMana={me.maxMana}
      hand={me.hand.length}
      buzz={me.buzzLeft ?? 0}
      active={game.active === ME}
      shielded={isShielded(game, ME)}
      delayed={delayedDamageOn(game, ME)}
      piles={<Piles owner={ME} deck={me.deck.length} trash={me.trash} onTrash={() => setTrashView(ME)} />}
      clock={online && myClock && !game.winner ? <ClockChip left={myClock} mine /> : null}
    />
  );
  const turnPill = !game.winner && (
    <span className={`turn-pill ${game.active === ME ? "mine" : "foe"}`}>
      <small>TURN {game.turn}</small>
      {game.active === ME ? "あなたのターン" : "相手のターン"}
    </span>
  );
  const foeRow = (
    <div className="row">
      {SLOT_KEYS.map((key, slot) => {
        const u = foe.field[slot];
        return u ? (
          unitCard(CPU, slot, u)
        ) : (
          <div
            key={key}
            className={`slot ${slot === 2 ? "center" : ""} ${omenAt(CPU, slot) ? "omen-slot" : ""}`}
          >
            {omenAt(CPU, slot) && <OmenFlame />}
          </div>
        );
      })}
    </div>
  );
  const meRow = (
    <div className="row">
      {SLOT_KEYS.map((key, slot) => {
        const u = me.field[slot];
        if (u) return unitCard(ME, slot, u);
        const drop = myTurn && selection?.kind === "hand" && !postSelected;
        const omen = omenAt(ME, slot);
        return (
          <button
            key={key}
            type="button"
            data-drop={`slot:${slot}`}
            className={`slot ${slot === 2 ? "center" : ""} ${drop ? "droppable" : ""} ${drop && drag?.over === `slot:${slot}` ? "drop-over" : ""} ${omen ? "omen-slot" : ""}`}
            disabled={!drop}
            aria-label={`空き枠 ${slot + 1}${slot === 2 ? "（センター）" : ""}${omen ? `（闇の気配：${nameOf(omen.cardId)}）` : ""}`}
            onClick={() => play(slot)}
          >
            {omen && <OmenFlame />}
          </button>
        );
      })}
    </div>
  );
  const handEl = (
    <div className="hand" data-hand={ME} data-drop="hand" style={{ "--n": me.hand.length } as CSSProperties}>
      {me.hand.map((id, i) => handCard(id, i))}
    </div>
  );
  const buzzBtn = (
    <button
      type="button"
      className={`btn buzz-btn ${buzzing ? "on" : ""} ${canBuzz ? "ready" : ""}`}
      onClick={() => {
        if (buzzing) return select(null);
        // アイコンを選んであれば確認を出す。選んでいなければ、選ぶところから
        if (buzzTarget !== null) return setBuzzAsk(buzzTarget);
        select({ kind: "buzz" });
      }}
      disabled={!canBuzz && !buzzing}
      title={buzzWhy ?? "選んだ自分のアイコン1体に攻撃力+2・体力+2・凸"}
      aria-label={`バズ（残り${me.buzzLeft ?? 0}回）${buzzWhy ? `：${buzzWhy}` : ""}`}
    >
      {buzzOpen && buzzWake > 0 && <span key={buzzWake} className="buzz-ring" aria-hidden="true" />}
      バズ
      <span className="buzz-pips" aria-hidden="true">
        {[0, 1].map((k) => (
          <i key={k} className={k < (me.buzzLeft ?? 0) ? "on" : ""} />
        ))}
      </span>
    </button>
  );
  const endTurnBtn = (
    <button
      type="button"
      className={`btn end-turn ${myTurn ? "now" : ""}`}
      onClick={() => setConfirmEnd(true)}
      disabled={!myTurn}
    >
      ターン終了
    </button>
  );
  const logList = (
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
  );
  const resignBtn = online && !game.winner && (
    <button
      type="button"
      className={`btn ghost resign ${resignAsk ? "ask" : ""}`}
      onClick={() => (resignAsk ? resign() : setResignAsk(true))}
      onBlur={() => setResignAsk(false)}
    >
      {resignAsk ? "本当に降参する" : "降参"}
    </button>
  );
  const quitBtn = (
    <button type="button" className="btn ghost quit" onClick={quit}>
      {online ? "ロビーへ" : "戻る"}
    </button>
  );
  /** 選んだカード（手札・攻撃するアイコン）をやめて、手札を元の形に戻す */
  const cancelSelection = () => {
    if (selection) select(null);
  };
  const field = fieldOf(game, CATALOG);
  const boardClass = `board turn-${game.active === ME ? "me" : "foe"}${field ? ` field-${field.kind}` : ""}${director !== null ? " field-director" : ""}${arbiter ? " field-arbiter" : ""}${fixer ? " field-fixer" : ""}`;
  const fieldLayer = field ? <FieldLayer kind={field.kind} mine={field.owner === ME} /> : null;

  return (
    <div className="play-full">
      <div className="safe-probe" ref={probe} aria-hidden="true" />
      <div
        className="stage portrait"
        style={
          {
            left: stage.cx,
            top: stage.cy,
            width: stage.width,
            height: stage.height,
            transform: `translate(-50%, -50%) scale(${stage.scale})`,
            "--slot": `${stage.slot}px`,
            "--hand": `${stage.hand}px`,
          } as CSSProperties
        }
      >
        {/* 縦の舞台：上から 相手 → 相手の場 → 自分の場 → 自分 → 押したカードの説明 → バズ・ターン終了 →（余白）→ 手札 */}
        <div className={`pstage ${boardClass}`} data-drop="board">
          {fieldLayer}
          {director !== null && (
            <DirectorField key={director.id} aces={director.aces} onDone={() => setDirector(null)} />
          )}
          {arbiter && (
            <ArbiterField key={arbiter.id} leaving={arbiter.leaving} onDone={() => setArbiter(null)} />
          )}
          {fixer && <FixerField key={fixer.id} ref={fixerApi} onDone={() => setFixer(null)} />}
          <div className="ptop">
            {quitBtn}
            {turnPill}
            <span className="ptop-right">
              <button type="button" className="btn ghost small plog" onClick={() => setLogOpen(true)}>
                記録
              </button>
              {resignBtn}
            </span>
          </div>
          {foeBar}
          <div className="pfield">
            {foeRow}
            {/* 場と場の間には何も置かない（案内の文は出さない。反則のときだけ、短く知らせて消える） */}
            {error && (
              <p key={error} className="ptoast" role="alert">
                {error}
              </p>
            )}
            {meRow}
          </div>
          {meBar}
          <PeekStrip card={peekCard} view={peek?.view} onOpen={() => setZoom(peek)} />
          {/* ここから下（手札のまわりの空き）を押すと、選んだカードを手札に戻す */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは「戻す」ボタンで同じことができる */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 余白を押して選択をやめるための受け皿 */}
          <div
            className="phand-zone"
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (!t.closest(".mini, button")) cancelSelection();
            }}
          >
            <div className="pdock">
              {/* 操作のボタンは、手札を持つ右手の親指が届く右下にまとめる（スマホのカードゲームの定番の位置） */}
              <span className="pdock-actions">
                {buzzBtn}
                {endTurnBtn}
              </span>
            </div>
            <div className="phand">
              {handEl}
              <button
                type="button"
                className={`hand-cancel ${selection ? "on" : ""}`}
                onClick={cancelSelection}
                aria-label="選んだカードを手札に戻す"
                tabIndex={selection ? 0 : -1}
              >
                <span aria-hidden="true">戻す</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {logOpen && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="対戦の記録">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setLogOpen(false)} />
          <div className="sheet-body log-sheet">
            <h2>対戦の記録</h2>
            {logList}
            <button type="button" className="btn ghost" onClick={() => setLogOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {drag && (
        // 指の位置に付いてくる表示は画面座標で置くので、画面座標の層（.vp-layer。frame.ts）に入れる
        <div className="vp-layer">
          {(() => {
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
        </div>
      )}

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
      {openingOn && deck && (
        <Opening
          key={opening}
          me={deck}
          foe={foeDeck}
          foeName={online ? foeName : "CPU"}
          ms={openingMs()}
          onDone={() => {
            openingSeen = opening;
            setOpenSeen(opening);
          }}
        />
      )}
      {buzzAsk !== null && buzzAskUnit && canBuzz && (
        <BuzzConfirm
          card={CATALOG[buzzAskUnit.cardId] as CardDef}
          view={viewUnit(game, ME, buzzAskUnit, CATALOG)}
          left={me.buzzLeft ?? 0}
          onYes={() => {
            setBuzzAsk(null);
            buzz(buzzAsk);
          }}
          onNo={() => {
            setBuzzAsk(null);
            if (buzzing) select(null);
          }}
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
        <CardZoom
          card={CATALOG[zoom.id] as CardDef}
          view={zoom.view}
          darkPreview
          initialDark={zoom.dark}
          onClose={() => setZoom(null)}
        />
      )}

      {trashView && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="オワコン">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setTrashView(null)} />
          <div className="sheet-body trash-list">
            <h2>
              {trashView === ME ? "あなた" : foeName}のオワコン（{game.players[trashView].trash.length}枚）
            </h2>
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
        <Result
          game={game}
          onAgain={online ? undefined : () => start(deck)}
          onQuit={quit}
          online={online}
          endedBy={log
            .map((l) => l.e.type)
            .reverse()
            .find((t) => t === "timedOut" || t === "resigned")}
        />
      )}
    </div>
  );
}

/**
 * 縦の舞台で、押したカードの説明を1本の帯で見せる（大きなカードを置く場所がないため）。
 * 絵・名前・コスト・攻撃力/体力・効果文（2行まで）。押すと画面いっぱいに拡大して全文を読める
 */
function PeekStrip({ card, view, onOpen }: { card: CardDef | null; view?: UnitView; onOpen: () => void }) {
  if (!card) {
    return (
      <div className="peek-strip empty">
        <span>カードを押すと、ここに説明が出ます。長押しで画面いっぱいに拡大</span>
      </div>
    );
  }
  const dark = !!view?.unit.dark && card.dark;
  const art = dark ? (card.dark?.art ?? card.art) : card.art;
  const name = dark ? card.dark?.name : card.name;
  const effect = (dark ? card.dark?.effect : card.effect) || "効果なし";
  const keywords = view?.keywords ?? card.keywords;
  const states = view
    ? [
        view.exposed && "晒し者",
        view.unit.exposeAtTurnEnd && "ターンの終わりに晒される",
        view.asleep && "眠っている",
        view.unit.silenced && "訂正済み",
        view.hp < view.maxHp && "ダメージあり",
      ].filter((x): x is string => !!x)
    : [];
  return (
    <div className={`peek-strip ${dark ? "is-dark" : ""} ${card.type === "post" ? "is-post" : ""}`}>
      <button type="button" className="ps-main" onClick={onOpen} aria-label={`${name} の説明を大きく見る`}>
        <span
          className="ps-art"
          style={
            art
              ? { backgroundImage: `url(${art})` }
              : { background: ATTR_META[card.attributes[0] ?? "草"].deep }
          }
        />
        <span className="ps-body">
          <span className="ps-head">
            <b className="ps-name">
              {name}
              {card.epithet && <small>{card.epithet}</small>}
            </b>
            <span className="ps-meta">
              <i className="ps-cost">{card.cost}</i>
              {card.type === "icon" ? (
                <>
                  <i className="t-atk">{view?.attack ?? card.attack}</i>／
                  <i className="t-hp">
                    {view?.hp ?? card.hp}
                    {view && view.hp < view.maxHp && <small>/{view.maxHp}</small>}
                  </i>
                </>
              ) : (
                <i className="ps-post">投稿</i>
              )}
            </span>
          </span>
          <span className="ps-effect">
            {keywords.map((k) => (
              <HelpTerm key={k} term={k} className="ps-kw" />
            ))}
            {states.length > 0 && <em className="ps-state">{states.join("・")}</em>}
            <EffectText text={effect} />
          </span>
        </span>
      </button>
      <button type="button" className="ps-zoom" onClick={onOpen} aria-label="大きく見る">
        拡大
      </button>
    </div>
  );
}

function Result({
  game,
  onAgain,
  onQuit,
  online,
  endedBy,
}: {
  game: GameState;
  onAgain?: () => void;
  onQuit: () => void;
  online: boolean;
  /** 降参・時間切れで決着したとき */
  endedBy?: GameEvent["type"];
}) {
  // ランダムマッチなら、レーティングの動き
  const rating = useLive((s) => s.rating);
  const won = game.winner === ME;
  const why =
    endedBy === "timedOut"
      ? won
        ? "相手の時間切れ"
        : "時間切れ"
      : endedBy === "resigned"
        ? won
          ? "相手の降参"
          : "降参"
        : null;
  return (
    <div className="result" role="dialog" aria-modal="true" aria-label="対戦結果">
      <div className={`result-card ${won ? "win" : "lose"}`}>
        <strong>{won ? "勝利！" : "敗北…"}</strong>
        <span>
          {game.turn} ターン目で決着{why && `（${why}）`}
        </span>
        {online && rating && (
          <p className="result-rating">
            レート {rating.before} → <b>{rating.after}</b>
            <em className={rating.after >= rating.before ? "up" : "down"}>
              {rating.after >= rating.before ? "+" : ""}
              {rating.after - rating.before}
            </em>
          </p>
        )}
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
  /** マスターが守られていて、ダメージを受けない */
  shielded?: boolean;
  /** このマスターに付いている「次の自分のターンの終わりに受けるダメージ」（0 なら無し） */
  delayed?: number;
  targetable?: boolean;
  /** ドラッグした攻撃が、いまこのマスターの上にある */
  dropOver?: boolean;
  /** 攻撃したときの見込み */
  preview?: AttackPreview | null;
  onClick?: () => void;
  piles: React.ReactNode;
  /** バズの残り回数 */
  buzz?: number;
  /** オンライン対戦の持ち時間 */
  clock?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * 持ち時間の表示。手番の人は、まずターンの 30 秒が減り、使い切ると持ち時間が減る（赤くなる）。
 * 手番でない人は、持ち時間の残りだけ。差し出しを選ぶ番なら、その残り
 */
function ClockChip({ left, mine }: { left: ClockLeft; mine?: boolean }) {
  const who = mine ? "あなた" : "相手";
  if (left.pick !== null)
    return (
      <span
        className="pb-clock pick"
        role="timer"
        aria-label={`${who}が差し出しを選ぶ残り ${formatClock(left.pick)}`}
      >
        選ぶ <b>{formatClock(left.pick)}</b>
      </span>
    );
  const inBank = left.running && left.turn <= 0;
  const hurry = left.running && (inBank ? left.bank <= 30_000 : left.turn <= 10_000);
  return (
    <span
      className={`pb-clock ${left.running ? "run" : ""} ${inBank ? "bank" : ""} ${hurry ? "hurry" : ""}`}
      role="timer"
      aria-label={`${who}の${left.running ? `ターンの残り ${formatClock(left.turn)}、` : ""}持ち時間 ${formatClock(left.bank)}`}
    >
      {left.running && !inBank && <b>{formatClock(left.turn)}</b>}
      <small>
        持ち時間 <i>{formatClock(left.bank)}</i>
      </small>
    </span>
  );
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
  shielded,
  delayed = 0,
  targetable,
  dropOver,
  preview,
  onClick,
  piles,
  children,
  buzz,
  clock,
}: BarProps) {
  const pct = Math.max(0, Math.min(100, (lp / 20) * 100));
  const pips = Array.from({ length: Math.max(maxMana, mana) }, (_, i) => i < mana);
  const body = (
    <>
      <span className="pb-name">
        {name}のマスター
        {active && <i className="turn-dot" title="この人のターン" />}
        {guarded && <span className="pb-guard">ガードで守られている</span>}
        {shielded && <span className="pb-shield">無敵（次の相手のターンまで）</span>}
        {delayed > 0 && <span className="pb-delayed">ターンの終わりに{delayed}ダメージ</span>}
        {clock}
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
        {buzz !== undefined && (
          <span className="pb-buzz" title={`バズ 残り${buzz}回`}>
            バズ
            {[0, 1].map((k) => (
              <i key={k} className={k < buzz ? "on" : ""} />
            ))}
          </span>
        )}
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
