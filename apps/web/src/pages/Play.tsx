import { type CardDef, type DeckId } from "@trends/cards";
import {
  type AttackPreview,
  type AttackTarget,
  attackTargets,
  buzzBlock,
  type CastTarget,
  canUnitAttack,
  castTargets,
  darkOmens,
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
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AttrChips } from "../cards/AttrChips";
import { EffectText, HelpTerm } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { fxStage } from "../fx/stage";
import { summonWaveLater } from "../fx/summonWave";
import { CardZoom } from "../game/CardZoom";
import { type DarkCut, DarkCutscene } from "../game/DarkCutscene";
import { useDecksChanged } from "../game/deckSync";
import { builtinDeck, customDeckSel, type DeckSel, deckErrors, loadCustomDecks } from "../game/decks";
import {
  animateAttack,
  animateDraw,
  animateEffects,
  flipCard,
  hasVisibleEffects,
  markBuzzed,
  popDamage,
  popMaster,
} from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { CATALOG, CPU, DECK_INFO, ME, setPresenter, useGame } from "../game/store";
import { useDragPlay } from "../game/useDragPlay";
import { layoutViewport, lockZoom, resetZoom } from "../viewport";

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
 * - 縦持ち（幅＜高さ）は、スマホの縦画面を基準にした縦の舞台（幅 390。高さは画面の縦横比に合わせて 720〜860）。
 *   場の枠は横幅から（5 枠が横いっぱい）、手札の大きさは舞台の高さから決める
 */
const STAGE_W = 960;
const STAGE_H = 540;
const STAGE_H_MIN = 432;
/** 場の枠の幅から決まる、舞台の縦の長さ（余白＋案内＋場2段＋手札）。stage の CSS と合わせる */
const fitSlot = (height: number) => Math.min(100, Math.floor((height - 84) / 4.08));
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
  /** 縦の舞台（スマホの縦持ち） */
  portrait: boolean;
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
  const aspect = w / h;
  const cx = safe.l + w / 2;
  const cy = safe.t + h / 2;
  if (w < h) {
    const height = Math.min(PORTRAIT_H_MAX, Math.max(PORTRAIT_H_MIN, PORTRAIT_W / aspect));
    return {
      width: PORTRAIT_W,
      height,
      scale: Math.min(w / PORTRAIT_W, h / height),
      slot: fitPortraitSlot(PORTRAIT_W),
      cx,
      cy,
      portrait: true,
      hand: fitHand(height),
    };
  }
  const height = Math.min(STAGE_H, Math.max(STAGE_H_MIN, STAGE_W / aspect));
  const width = Math.max(STAGE_W, height * aspect);
  const slot = fitSlot(height);
  return {
    width,
    height,
    scale: Math.min(w / width, h / height),
    slot,
    cx,
    cy,
    portrait: false,
    hand: Math.round(slot * 0.92),
  };
}

function useStage() {
  const probe = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>(() => measureStage(STAGE_W, STAGE_H));
  useLayoutEffect(() => {
    // 拡大の影響を受けない大きさで測る（iPhone で拡大されても舞台が縮まない）
    const on = () => {
      const { width, height } = layoutViewport();
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
function DeckAce({ id }: { id?: string }) {
  const card = id ? CATALOG[id] : undefined;
  if (!card?.art) return null;
  return (
    <span className="deck-ace" aria-hidden="true">
      <span className="deck-ace-bg" style={{ backgroundImage: `url(${card.art})` }} />
      {card.subject ? (
        <img className="deck-ace-subject" src={card.subject} alt="" loading="lazy" draggable={false} />
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
      <span className="field-label">
        {kind === "omen"
          ? `${mine ? "あなた" : "相手"}の闇の気配……`
          : `${mine ? "あなた" : "相手"}の闇が降りている`}
      </span>
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

/** バズのカットイン：マスターと「バズ」の文字が、自分は左から・相手は右から差し込む */
function BuzzCutIn({ cut, onDone }: { cut: BuzzCut; onDone: () => void }) {
  const card = CATALOG[cut.cardId];
  return (
    <div
      className={`buzz-cut ${cut.mine ? "mine" : "foe"}`}
      aria-live="polite"
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
    >
      <div className="bc-band">
        <span className="bc-master">
          <i aria-hidden="true">{cut.mine ? "YOU" : "VS"}</i>
          <b>{cut.mine ? "あなた" : cut.foeName}のマスター</b>
        </span>
        <span className="bc-word" aria-hidden="true">
          バズ
        </span>
        <span className="bc-target">
          {card?.art && <span className="bc-art" style={{ backgroundImage: `url(${card.art})` }} />}
          <span>
            <b>{card?.name}</b>
            <small>攻撃力+2・体力+2・凸</small>
          </span>
        </span>
        <span className="bc-left" role="img" aria-label={`バズ 残り${cut.left}回`}>
          {Array.from({ length: cut.total }, (_, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 残りの玉は位置そのものが意味を持つ
            <i key={k} className={k < cut.left ? "on" : ""} />
          ))}
        </span>
      </div>
    </div>
  );
}

type BuzzCut = {
  id: number;
  mine: boolean;
  cardId: string;
  foeName: string;
  left: number;
  total: number;
  done: () => void;
};

/** デッキの色（単属性なら左右とも同じ色） */
function deckGradient(attrs: readonly string[]) {
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
      style={{ background: deckGradient(sel.attrs) }}
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
        <div className="deck-confirm-head" style={{ background: deckGradient(deck.attrs) }}>
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
  /** 『フィクサー』の登場（画面全体の暗転とスポットライト）と、差し出されたアイコンの名前 */
  const [fixer, setFixer] = useState<{ id: number; mine: boolean; gone?: string[] } | null>(null);
  const [trashView, setTrashView] = useState<PlayerId | null>(null);
  /** 対戦の記録（縦の舞台では下から出る一覧） */
  const [logOpen, setLogOpen] = useState(false);
  const seen = useRef(0);
  const { stage, probe } = useStage();
  /** バズのカットイン */
  const [buzzCut, setBuzzCut] = useState<BuzzCut | null>(null);
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

  // 演出の舞台（PixiJS）を先に用意しておく（最初の演出で読み込み待ちにならないように）
  useEffect(() => {
    void fxStage();
  }, []);

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
        } else if (a.type === "play") {
          if (!visible) return;
          await wait(420); // 出たアイコンが場に着くのを待つ
          const uid = next.players[a.player].field[a.slot]?.uid;
          const from = uid ? document.querySelector<HTMLElement>(`[data-uid="${uid}"]`) : null;
          await animateEffects(shown, events, next, { from, tint });
        } else if (visible) {
          await animateEffects(shown, events, next, { from: null });
        }
      },
      buzz: (g, a) =>
        new Promise<void>((resolve) => {
          const u = g.players[a.player].field[a.slot];
          if (!u) return resolve();
          const me = g.players[a.player];
          setBuzzCut({
            id: Date.now(),
            mine: a.player === ME,
            cardId: u.cardId,
            foeName: useGame.getState().foeName,
            left: Math.max(0, (me.buzzLeft ?? 0) - 1),
            total: 2,
            done: resolve,
          });
        }),
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
      // ★5 のアイコンが場に着いた瞬間に、属性の色の小さな波動（落ちてくる動きの着地に合わせる）
      if (e.type === "played") {
        const card = CATALOG[e.cardId];
        const uid = uidAt(e.player, e.slot);
        if (card?.type === "icon" && card.rarity === 5 && uid) {
          summonWaveLater(uid, card.attributes, t + 160);
        }
      }
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
      } else if (e.type === "played" && CATALOG[e.cardId]?.effects.some((x) => x.do === "sacrifice")) {
        // 『フィクサー』の登場：ほかのカードに無い、画面全体の暗転
        const intro = { id, mine: e.player === ME };
        setTimeout(() => setFixer(intro), t);
        t += 1400;
      } else if (e.type === "sacrificed") {
        const name = `${CATALOG[e.cardId]?.name ?? ""}（${e.player === ME ? "あなた" : "相手"}）`;
        setTimeout(
          () =>
            setFixer((f) => ({ id: f?.id ?? id, mine: f?.mine ?? false, gone: [...(f?.gone ?? []), name] })),
          t,
        );
      } else if (e.type === "buzz") {
        // バズの対象を盤面で強調する（光の枠と「バズ」の札、+2/+2）
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => markBuzzed(uid, e.attack, e.hp), t);
      } else if (e.type === "darkFall" || e.type === "restored") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
      }
    }
  }, [log]);

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
  const omenAt = (owner: PlayerId, slot: number) => darkOmens(game, owner).find((o) => o.slot === slot);
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const preview = (t: AttackTarget) =>
    attacking && canHit(t) ? previewAttack(game, ME, selection.slot, t, CATALOG) : null;
  const foeGuarded = foe.field.some((u) => u && viewUnit(game, CPU, u, CATALOG).guard);
  const peekCard = (peek ? CATALOG[peek.id] : null) ?? null;
  const hint = game.winner
    ? ""
    : game.pending
      ? sacSlots.length > 0
        ? "『フィクサー』：差し出す自分のアイコンを1体選んでください（赤く光っているアイコン）"
        : "相手が差し出すアイコンを選んでいます…"
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
            : buzzing
              ? "バズさせる自分のアイコンを選んでください（攻撃力+2・体力+2・凸）"
              : selection?.kind === "hand"
                ? "出す枠を押してください（もう一度カードを押すと、選ぶのをやめます）"
                : attacking
                  ? foeGuarded
                    ? "攻撃先を選んでください（ガードがいるので、ガードしか攻撃できません）"
                    : "攻撃先を選んでください（光っているところ）"
                  : darkOmens(game, ME).length > 0
                    ? "闇の気配……オワコンになったエースは、次の自分のターンの始めに闇堕ちして戻ってくる"
                    : stage.portrait
                      ? "手札を場へ引っぱって出す・投稿／アイコンを相手へ引っぱって攻撃（長押しで拡大）"
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
          if (buzzing) return buzz(slot);
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

  // 舞台の部品。横の舞台（3列）と縦の舞台（1列）で同じものを並べ替える
  const foeBar = (
    <PlayerBar
      side="foe"
      name={foeName}
      lp={foe.lp}
      mana={foe.mana}
      maxMana={foe.maxMana}
      hand={foe.hand.length}
      buzz={foe.buzzLeft ?? 0}
      active={game.active === CPU}
      guarded={foeGuarded}
      shielded={isShielded(game, CPU)}
      targetable={attacking && canHit({ kind: "leader" })}
      dropOver={drag?.over === "leader" && attacking && canHit({ kind: "leader" })}
      preview={preview({ kind: "leader" })}
      onClick={() => !justDragged() && attack({ kind: "leader" })}
      piles={<Piles owner={CPU} deck={foe.deck.length} trash={foe.trash} onTrash={() => setTrashView(CPU)} />}
    />
  );
  const meBar = (
    <PlayerBar
      side="me"
      name="あなた"
      lp={me.lp}
      mana={me.mana}
      maxMana={me.maxMana}
      hand={me.hand.length}
      buzz={me.buzzLeft ?? 0}
      active={game.active === ME}
      shielded={isShielded(game, ME)}
      piles={<Piles owner={ME} deck={me.deck.length} trash={me.trash} onTrash={() => setTrashView(ME)} />}
    />
  );
  const turnPill = !game.winner && (
    <span className={`turn-pill ${game.active === ME ? "mine" : "foe"}`}>
      {stage.portrait && <small>TURN {game.turn}</small>}
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
  const hintEl = (
    <p className={`hint ${error ? "is-error" : ""}`} aria-live="polite" role={error ? "alert" : undefined}>
      {error ?? hint}
    </p>
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
  const handMore = me.hand.length >= 7 && (
    <button type="button" className="hand-more" onClick={() => setHandOpen(true)}>
      手札 {me.hand.length}枚を広げる
    </button>
  );
  const buzzBtn = (
    <button
      type="button"
      className={`btn buzz-btn ${buzzing ? "on" : ""} ${canBuzz ? "ready" : ""}`}
      onClick={() => (buzzing ? select(null) : select({ kind: "buzz" }))}
      disabled={!canBuzz && !buzzing}
      title={buzzWhy ?? "自分のアイコン1体に攻撃力+2・体力+2・凸"}
      aria-label={`バズ（残り${me.buzzLeft ?? 0}回）${buzzWhy ? `：${buzzWhy}` : ""}`}
    >
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
      {stage.portrait ? (online ? "ロビーへ" : "戻る") : online ? "ロビーに戻る" : "デッキ選択に戻る"}
    </button>
  );
  /** 選んだカード（手札・攻撃するアイコン）をやめて、手札を元の形に戻す */
  const cancelSelection = () => {
    if (selection) select(null);
  };
  const field = fieldOf(game, CATALOG);
  const boardClass = `board turn-${game.active === ME ? "me" : "foe"}${field ? ` field-${field.kind}` : ""}`;
  const fieldLayer = field ? <FieldLayer kind={field.kind} mine={field.owner === ME} /> : null;

  return (
    <div className="play-full">
      <div className="safe-probe" ref={probe} aria-hidden="true" />
      <div
        className={`stage ${stage.portrait ? "portrait" : ""}`}
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
        {stage.portrait ? (
          /* 縦の舞台：上から 相手 → 相手の場 → 案内 → 自分の場 → 自分 → 押したカードの説明 → 直近の出来事＋バズ・ターン終了 → 手札 */
          <div className={`pstage ${boardClass}`} data-drop="board">
            {fieldLayer}
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
              {/* 場と場の間は案内だけ（ボタンは親指の届く手札の上の右へ） */}
              <div className="pmid">{hintEl}</div>
              {meRow}
            </div>
            {meBar}
            <PeekStrip card={peekCard} view={peek?.view} onOpen={() => setZoom(peek)} />
            {/* 直近の出来事は見せるだけ。ここから下（手札のまわりの空き）を押すと、選んだカードを手札に戻す */}
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
                <div className="plog-ticker" aria-hidden="true">
                  {log.slice(-3).map(({ id, e }) => (
                    <span key={id} className={`ev-${e.type}`}>
                      {describe(e)}
                    </span>
                  ))}
                </div>
                {/* 操作のボタンは、手札を持つ右手の親指が届く右下にまとめる（スマホのカードゲームの定番の位置） */}
                <span className="pdock-actions">
                  {buzzBtn}
                  {endTurnBtn}
                </span>
              </div>
              <div className="phand">
                {handMore}
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
        ) : (
          <div className="stage-grid">
            <div className="col-left">
              {foeBar}
              {turnPill}
              {meBar}
            </div>

            <div className={`col-center ${boardClass}`} data-drop="board">
              {fieldLayer}
              {foeRow}
              {hintEl}
              {meRow}
              {handEl}
              {handMore}
            </div>

            <div className="col-right">
              <div className="peek">
                {peekCard ? (
                  <PeekCard
                    key={peekCard.id}
                    card={peekCard}
                    view={peek?.view}
                    onOpen={() => setZoom(peek)}
                  />
                ) : (
                  <p className="muted">カードを押すと、ここに表示します。長押しで画面いっぱいに拡大</p>
                )}
              </div>
              {buzzBtn}
              {endTurnBtn}
              <details className="log-box">
                <summary>対戦の記録</summary>
                {logList}
              </details>
              {resignBtn}
              {quitBtn}
            </div>
          </div>
        )}
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

      {fixer && (
        <div
          key={fixer.id}
          className={`fixer-cut ${fixer.gone ? "gone" : ""}`}
          aria-hidden="true"
          onAnimationEnd={(e) => e.target === e.currentTarget && setFixer(null)}
        >
          <div className="fx-beam" />
          {!fixer.gone && (
            <div className="fx-face">
              <i />
              <i />
              <i />
            </div>
          )}
          <div className="fx-title">
            <small>{fixer.mine ? "あなたの" : "相手の"}裏で、誰かが糸を引いている</small>
            <b>『フィクサー』</b>
            {fixer.gone ? (
              <span>差し出された：{fixer.gone.join("・")}</span>
            ) : (
              <span>自分と相手は、それぞれ自分のアイコンを1体差し出す</span>
            )}
          </div>
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
      {buzzCut && (
        <BuzzCutIn
          key={buzzCut.id}
          cut={buzzCut}
          onDone={() => {
            buzzCut.done();
            setBuzzCut(null);
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
          {view.exposed && <span>晒し者（ガードを失い、強化が消えた）</span>}
          {view.unit.exposeAtTurnEnd && <span>ターンの終わりに晒し者になる（炎上商法）</span>}
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
  /** マスターが守られていて、ダメージを受けない */
  shielded?: boolean;
  targetable?: boolean;
  /** ドラッグした攻撃が、いまこのマスターの上にある */
  dropOver?: boolean;
  /** 攻撃したときの見込み */
  preview?: AttackPreview | null;
  onClick?: () => void;
  piles: React.ReactNode;
  /** バズの残り回数 */
  buzz?: number;
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
  shielded,
  targetable,
  dropOver,
  preview,
  onClick,
  piles,
  children,
  buzz,
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
