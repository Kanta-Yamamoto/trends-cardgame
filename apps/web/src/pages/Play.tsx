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
  damageCutOn,
  darkFallSlots,
  darkOmens,
  delayedDamageOn,
  effectiveCost,
  fieldOf,
  type GameEvent,
  type GameState,
  isShielded,
  openSlots,
  type PlayerId,
  previewAttack,
  SLOTS,
  sacrificeCandidates,
  slotOpen,
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
import { COLLAGE_PASTE, collagePaste } from "../fx/collagePaste";
import { fieldEntry, landed } from "../fx/fieldEntry";
import { GOD_DESCENT_CARDS, godDescent } from "../fx/godDescent";
import { IDOL_LIVE, idolLive } from "../fx/idolLive";
import { KUSAHAMI_AMBUSH, kusahamiAmbush, kusahamiWither } from "../fx/kusahamiAmbush";
import { endCue, type LifeBreak, lifeBreak } from "../fx/lifeBreak";
import { MINAMO_LIVE, minamoLive } from "../fx/minamoLive";
import { fxEnabled } from "../fx/stage";
import { warmFx } from "../fx/warm";
import { ArbiterField } from "../game/ArbiterField";
import { CardZoom } from "../game/CardZoom";
import { CostStrip } from "../game/CostStrip";
import { type DarkCut, DarkCutscene } from "../game/DarkCutscene";
import { AttrDots, aceSubject, DeckAce, deckGradient } from "../game/DeckArt";
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
  fxLayer,
  hasVisibleEffects,
  markBuzzed,
  popDamage,
  popMaster,
  retireUnits,
  showGrowth,
  showRiding,
  summonCue,
} from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { endReason } from "../game/result";
import { CATALOG, CPU, DECK_INFO, ME, openingMs, setPresenter, useGame } from "../game/store";
import { useDragPlay } from "../game/useDragPlay";
import { type ClockLeft, formatClock, useClockLeft, useLive } from "../online/live";
import { lockZoom, resetZoom } from "../viewport";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 演出（GSAP）と同じ時計で待つ。着地などの GSAP の動きに間合いを合わせたいところで使う */
const gwait = (ms: number) => new Promise<void>((r) => gsap.delayedCall(ms / 1000, r));
const SLOT_KEYS = Array.from({ length: SLOTS }, (_, i) => `slot-${i}`);
/** 決着した state が画面に出てから、負けた側の帯が砕け始めるまでの最短の間（最後の一撃のダメージの数字とライフが 0 になるのを見せる） */
const END_SETTLE = 450;
const nameOf = (id: string) => CATALOG[id]?.name ?? id;
const who = (p: string) => (p === ME ? "あなた" : useGame.getState().foeName);

type Point = { x: number; y: number };

/** その出来事で場からいなくなったキャラクター（破壊・手札に戻る・差し出し）を、cur から除いた state */
function withoutGone(cur: GameState, events: GameEvent[], alive: ReadonlySet<number>): GameState {
  let out = cur;
  for (const e of events) {
    if (e.type !== "destroyed" && e.type !== "bounced" && e.type !== "sacrificed") continue;
    const p = out.players[e.player];
    const u = p.field[e.slot];
    if (!u || alive.has(u.uid)) continue;
    out = {
      ...out,
      players: {
        ...out.players,
        [e.player]: { ...p, field: p.field.map((x, i) => (i === e.slot ? null : x)) },
      },
    };
  }
  return out;
}

/** そのカードが【破壊されたとき】に出すキャラクターの数（闇の姿の効果も見る） */
const summonsOnDeath = (from: string) => {
  const c = CATALOG[from];
  return [...(c?.effects ?? []), ...(c?.dark?.effects ?? [])].reduce(
    (n, f) => (f.on === "death" && f.do === "summon" ? n + f.count : n),
    0,
  );
};

/**
 * 出来事を、効果でキャラクターが出たところ（summoned）で区切って、前から順に見せる。
 * 区切りの前の出来事（出たこと・効果が当たる・破壊されたキャラクターが消える）を見せ終えてから、
 * 出す枠への合図（summonCue）のあとに、出たキャラクターを1体ずつ置く。
 * だから【場に出たとき】に出すものは出したキャラクターの着地のあと、【破壊されたとき】に出すものは破壊されて消えたあとに出る。
 * 合図は from（効果の出どころ）から飛ばし、【破壊されたとき】に出すものは、破壊されたキャラクターがいた所から飛ばす。
 * 見せ終えた state を返す
 */
async function presentPhased(
  shown: GameState,
  events: GameEvent[],
  next: GameState,
  opts: { from: HTMLElement | Point | null; tint?: string; skip?: ReadonlySet<number> },
  show: (g: GameState) => void,
): Promise<GameState> {
  const alive = new Set(
    (["p1", "p2"] as const).flatMap((p) => next.players[p].field.flatMap((u) => (u ? [u.uid] : []))),
  );
  let cur = shown;
  // 直前に破壊されたキャラクターのいた所と、【破壊されたとき】に出す残りの数（合図の出どころ。破壊された順に出る）
  let fell: { player: PlayerId; left: number; at: Point }[] = [];
  let i = 0;
  while (i < events.length) {
    if (events[i]?.type !== "summoned") {
      let j = i;
      while (j < events.length && events[j]?.type !== "summoned") j++;
      const part = events.slice(i, j);
      const after = withoutGone(cur, part, alive);
      fell = part.flatMap((e) => {
        if (e.type !== "destroyed") return [];
        const left = summonsOnDeath(e.cardId);
        const u = cur.players[e.player].field[e.slot];
        const el = u ? document.querySelector<HTMLElement>(`[data-uid="${u.uid}"]`) : null;
        if (!el || left === 0) return [];
        const r = el.getBoundingClientRect();
        return [{ player: e.player, left, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }];
      });
      const more = j < events.length;
      if (hasVisibleEffects(part)) await animateEffects(cur, part, after, { ...opts, untilGone: more });
      else if (more) await retireUnits(cur, part, after, opts.skip);
      else void retireUnits(cur, part, after, opts.skip);
      // このあとにキャラクターが出るなら、いなくなったキャラクターを画面から除いて、空いた枠を見せる
      if (more && after !== cur) {
        cur = after;
        show(cur);
        await gwait(120);
      }
      i = j;
      continue;
    }
    const e = events[i++] as Extract<GameEvent, { type: "summoned" }>;
    const unit = next.players[e.player].field[e.slot];
    // 同じ操作のうちに倒れたなど、最後の state にいないものは置かない（あとの演出に任せる）
    if (!unit || unit.cardId !== e.cardId || cur.players[e.player].field[e.slot]) continue;
    const source = fell.find((f) => f.player === e.player && f.left > 0);
    if (source) source.left--;
    await summonCue(
      source?.at ?? opts.from,
      document.querySelector<HTMLElement>(`[data-slot="${e.player}:${e.slot}"]`),
      opts.tint ?? "#fff3c4",
    );
    const p = cur.players[e.player];
    cur = {
      ...cur,
      players: {
        ...cur.players,
        [e.player]: { ...p, field: p.field.map((u, k) => (k === e.slot ? unit : u)) },
      },
    };
    show(cur);
    await gwait(280);
  }
  return cur;
}

function describe(e: GameEvent): string {
  switch (e.type) {
    case "played":
      return `${who(e.player)}：${nameOf(e.cardId)} を出した（コスト ${e.cost}）`;
    case "cast":
      return `${who(e.player)}：${nameOf(e.cardId)} を使った（コスト ${e.cost}）`;
    case "summoned":
      return `${who(e.player)}の場に ${nameOf(e.cardId)} が出た`;
    case "revived":
      return `${who(e.player)}の ${nameOf(e.cardId)} が、墓地から場に戻った（蘇生）`;
    case "transformed":
      return `${who(e.player)}の ${nameOf(e.cardId)} が ${nameOf(e.into)} になった（ネタにされた）`;
    case "battle": {
      const lost = e.destroyed.map(nameOf).join("・");
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}：${e.toDefender} ダメージ、反撃 ${e.toAttacker}${lost ? `（墓地：${lost}）` : ""}`;
    }
    case "damaged":
      return `${nameOf(e.cardId)} に ${e.amount} ダメージ`;
    case "destroyed":
      return e.vanished
        ? `${who(e.player)}の ${nameOf(e.cardId)}（闇堕ちの姿）が消えた`
        : `${who(e.player)}の ${nameOf(e.cardId)} が破壊された`;
    case "darkOmen":
      return `${who(e.player)}の ${nameOf(e.cardId)} が破壊されて裏向きになった。破壊された次のターンから、${who(e.player)}のターンに闇堕ちの姿で出せる`;
    case "darkFall":
      return `${who(e.player)}の ${nameOf(e.cardId)} が、闇堕ちして戻ってきた！`;
    case "buzz":
      return `${who(e.player)}：${nameOf(e.cardId)} がバズった！ 攻撃力+${e.attack}・体力+${e.hp}・突進（バズ 残り${e.left}）`;
    case "restored":
      return `${who(e.player)}の ${nameOf(e.cardId)} が表に戻った`;
    case "status":
      return `${nameOf(e.cardId)}：${e.status}`;
    case "buffed":
      return `${nameOf(e.cardId)} の攻撃力${e.attack >= 0 ? "+" : ""}${e.attack}${e.hp ? `・体力+${e.hp}` : ""}`;
    case "healed":
      return `${nameOf(e.cardId)} の体力が ${e.amount} 回復`;
    case "leaderDamaged":
      return `${who(e.player)}のプレイヤーに ${e.amount} ダメージ（ライフ ${e.lp}）`;
    case "leaderHealed":
      return `${who(e.player)}のライフが ${e.amount} 回復（ライフ ${e.lp}）`;
    case "drew":
      return `${who(e.player)}が1枚引いた`;
    case "burned":
      return `${who(e.player)}の手札がいっぱいで、引いた ${nameOf(e.cardId)} は墓地へ`;
    case "deckOut":
      return `${who(e.player)}の山札が切れた`;
    case "sacrificeAsk":
      return "『フィクサー』：自分と相手は、それぞれ自分のキャラクターを1体差し出す";
    case "sacrificed":
      return `${who(e.player)}の ${nameOf(e.cardId)} が差し出された`;
    case "specialWin":
      return `${who(e.player)}の山札が切れた。陰謀論者「これは世界のせいだ」──特殊勝利`;
    case "turnStarted":
      return `―― ${e.turn}ターン目：${who(e.player)}（コスト ${e.mana}）――`;
    case "stolen":
      return `${who(e.player)}が ${nameOf(e.cardId)} を奪った（推し変）`;
    case "bounced":
      return `${who(e.player)}の ${nameOf(e.cardId)} が手札に戻された`;
    case "shield":
      return e.kind === "shielded"
        ? `${who(e.player)}のプレイヤーは、次の相手のターンが終わるまでダメージを受けない`
        : `${who(e.player)}のプレイヤーへの ${e.amount} ダメージを防いだ`;
    case "delayedDamageSet":
      return `${who(e.player)}のプレイヤーに、${nameOf(e.cardId)} の「次の自分のターンの終わりに${e.amount}ダメージを受ける」効果が付いた`;
    case "delayedDamageFired":
      return `${who(e.player)}のプレイヤーに付いていた ${nameOf(e.cardId)} の効果が働いた`;
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
/** 縦の舞台の手札の幅：舞台が高いほど大きく持つ（場2段・プレイヤー2つ・説明の帯を引いた残りから） */
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
      <p className="deck-facts">
        <span className="tag">先攻・後攻はランダム</span>
        <span className="tag">CPU はほかのデッキから1つ</span>
      </p>
      <DeckGrid onPick={start} cta="対戦する" />
      <details className="rules g2">
        <summary>ルール（かんたん版）</summary>
        <ul>
          <li>相手のプレイヤーのライフ（20）を 0 にすれば勝ち。山札が引けなくなっても負け</li>
          <li>
            コストは毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。手札は先攻 3 枚・後攻 4 枚で始め、9
            枚まで（いっぱいのときに引いたカードは墓地へ）。後攻は最初のターンだけコスト +1
          </li>
          <li>
            キャラクターは場に 5 体まで出せる。出したターンは攻撃できない（速攻を除く）。呪文は使い切りの効果
          </li>
          <li>
            キャラクター同士で戦うと、お互いの<b className="t-atk">攻撃力</b>の分だけ相手の
            <b className="t-hp">体力</b>
            が減る。体力が 0 になったキャラクターは墓地へ。受けたダメージは残る
          </li>
          <li>相手の場にガードがいる間は、ガードしか攻撃できない。晒し状態になるとガードを失う</li>
          <li>
            闇堕ちを持つ★5は、破壊されたらその枠でカードが裏向きになる（その枠にはキャラクターを出せない）。破壊された次のターンから、自分のターンの好きなときに、裏向きのカードを押して闇堕ちの姿で出せる（出たターンは相手のキャラクターにだけ攻撃できる）。闇堕ちの姿が破壊されたら消える
          </li>
          <li>
            バズ：1試合に2回（自分の4ターン目から。後攻は3ターン目から）、自分のキャラクター1体に攻撃力+2・体力+2と突進
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
            <span className="op-attr common">ニュートラル</span>
          ) : (
            sel.attrs.map((a) => (
              <span
                key={a}
                className="op-attr"
                style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}
              >
                {a}
              </span>
            ))
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * 盤面の背景。闇堕ちを持つカードが墓地にされると「予兆」（持ち主の側から紫に染まる）、
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

/** 闇堕ちを持つキャラクターが破壊された枠に残る、裏向きのカード（紫の炎が灯る）。名前も案内も載せず、押すと説明の小窓を出す */
function OmenCard() {
  return (
    <span className="omen-card" aria-hidden="true">
      <OmenFlame />
    </span>
  );
}

/**
 * 裏向きのカードを押したときの説明。どういう状態かと、闇堕ちの姿（名前・攻撃力・体力・効果）を見せる。
 * 自分のカードで今闇堕ちさせられるときだけ「闇堕ちさせる」を出す
 */
function OmenSheet({
  card,
  owner,
  ready,
  onFall,
  onClose,
}: {
  card: CardDef;
  /** 持ち主の呼び方（自分なら null） */
  owner: string | null;
  ready: boolean;
  onFall: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const dark = card.dark;
  if (!dark) return null;
  const rush = dark.keywords?.includes("速攻") ? "速攻" : "出たターンは突進";
  const state =
    owner === null
      ? "闇堕ちを持つキャラクターが破壊されました。破壊された次のターンから、自分のターンに闇堕ちの姿で出せます。裏向きのカードがある枠には、キャラクターを出せません。"
      : `${owner}の闇堕ちを持つキャラクターが破壊されました。${owner}は、破壊された次のターンから、自分のターンに闇堕ちの姿で出せます。`;
  return (
    <div
      className="zoom-sheet end-confirm buzz-confirm dark-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={`裏向きの${card.name}`}
    >
      <button type="button" className="zoom-sheet-bg" aria-label="閉じる" onClick={onClose} />
      <div className="end-confirm-body">
        <p className="end-confirm-q">{card.name}</p>
        <p className="dkc-state">{state}</p>
        {owner === null && !ready && <p className="dkc-wait">いまは出せません</p>}
        <div className="bzc-head dkc-dark">
          {(dark.art ?? card.art) && (
            <span className="bzc-art" style={{ backgroundImage: `url(${dark.art ?? card.art})` }} />
          )}
          <div>
            <p className="dkc-label">闇堕ちの姿</p>
            <p className="bzc-stats">
              <span>{dark.name}</span>
              <span className="atk">
                攻撃力 <b>{dark.attack}</b>
              </span>
              <span className="hp">
                体力 <b>{dark.hp}</b>
              </span>
              <span>{rush}</span>
            </p>
          </div>
        </div>
        {dark.effect && <p className="dkc-effect">{dark.effect}</p>}
        {ready ? (
          <div className="end-confirm-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              やめる
            </button>
            <button type="button" className="btn dkc-go" onClick={onFall}>
              闇堕ちさせる
            </button>
          </div>
        ) : (
          <div className="end-confirm-actions one">
            <button type="button" className="btn ghost" onClick={onClose}>
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 裏向きのカードに灯る紫の炎 */
function OmenFlame() {
  return (
    <span className="omen-flame" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

const CHECK = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12l5 5 9-10" />
  </svg>
);

/**
 * デッキを選ぶ（CPU 戦とオンライン対戦で共通）。構築済みデッキと、自分で組んで保存したデッキを縦長のタイルで並べる。
 * confirmLabel が無ければ、押したデッキを選んだ状態にし、下の台のボタン（cta）で決める。
 * confirmLabel を渡すと、押したら中身を見せて確かめてから onPick する
 * （オンライン対戦は選んだらすぐ部屋ができる・相手を探すので、押し間違いを防ぐ）
 */
export function DeckGrid({
  onPick,
  confirmLabel,
  cta = "対戦する",
}: {
  onPick: (deck: DeckSel) => void;
  confirmLabel?: string;
  cta?: string;
}) {
  const [pending, setPending] = useState<DeckSel | null>(null);
  const [chosen, setChosen] = useState<DeckSel | null>(null);
  // 決まりを守れていない自分のデッキ（属性が2つの、前に組んだデッキなど）は選べない。デッキ構築で直してもらう
  const readMine = useCallback(() => {
    const all = loadCustomDecks();
    const ok = all.filter((d) => deckErrors(d.cards).length === 0);
    return { mine: ok, broken: all.length - ok.length };
  }, []);
  const [{ mine, broken }, setMine] = useState(readMine);
  // アカウントとそろえ終わったら、自分のデッキを読み直す
  useDecksChanged(useCallback(() => setMine(readMine()), [readMine]));
  const pick = (sel: DeckSel) => (confirmLabel ? setPending(sel) : setChosen(sel));
  const builtins = (Object.keys(DECK_INFO) as DeckId[]).map((id) => builtinDeck(id));
  const tile = (sel: DeckSel, i: number) => {
    const on = chosen?.ref === sel.ref;
    return (
      <button
        key={sel.ref}
        type="button"
        className={`deck-pick ${on ? "on" : ""}`}
        style={{ background: deckGradient(sel.attrs, sel.ace), animationDelay: `${Math.min(i, 8) * 0.05}s` }}
        aria-pressed={confirmLabel ? undefined : on}
        onClick={() => pick(sel)}
      >
        <DeckAce id={sel.ace} />
        <span className="deck-dots">
          <AttrDots attrs={sel.attrs} />
        </span>
        <span className="deck-check">{CHECK}</span>
        <strong className="deck-name">{sel.name}</strong>
      </button>
    );
  };
  return (
    <>
      <div className="sec">
        <h2>自分のデッキ</h2>
        {mine.length > 0 ? (
          <Link to="/decks" className="btn ghost small">
            デッキを組む
          </Link>
        ) : (
          <small>まだありません</small>
        )}
      </div>
      {mine.length > 0 && <div className="decks">{mine.map((d) => customDeckSel(d)).map(tile)}</div>}
      {broken > 0 && (
        <p className="muted deck-empty">
          決まり（属性は1つ＋ニュートラルのカード）を守れていないデッキが {broken}{" "}
          個あります。「デッキを組む」で直すと選べます
        </p>
      )}
      {mine.length === 0 && (
        <Link to="/decks" className="deck-new">
          <span aria-hidden="true">
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
          </span>
          デッキを組む（20枚）
        </Link>
      )}
      <div className="sec">
        <h2>構築済みデッキ</h2>
        <small>{builtins.length}個</small>
      </div>
      <div className="decks">{builtins.map(tile)}</div>
      {!confirmLabel && (
        <>
          <div className="deck-dock-pad" />
          <div className="deck-dock g3">
            <div className="deck-dock-text">
              <b>{chosen?.name ?? "デッキを選んでください"}</b>
              {chosen && <span>{chosen.text}</span>}
            </div>
            <button type="button" className="btn" disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
              {cta}
            </button>
          </div>
        </>
      )}
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
    </>
  );
}

/** デッキの確認（下から出る小窓。名前・属性・説明と、コストごとの枚数・入っているカード） */
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
    <div className="deck-confirm" role="dialog" aria-modal="true" aria-label="デッキの確認">
      <button type="button" className="deck-confirm-bg" aria-label="選び直す" onClick={onCancel} />
      <section className="deck-confirm-body">
        <div className="deck-confirm-hero" style={{ background: deckGradient(deck.attrs, deck.ace) }}>
          <DeckAce id={deck.ace} />
          <span className="deck-confirm-attr">
            <AttrDots attrs={deck.attrs} />
            {deck.attrs.length > 0 ? deck.attrs.join("×") : "ニュートラル"}
          </span>
          <div className="deck-confirm-text">
            <b>{deck.name}</b>
            <span>{deck.text}</span>
          </div>
        </div>
        <CostStrip cards={deck.cards} />
        <p className="deck-confirm-lh">
          入っているカード<small>{deck.cards.length}枚</small>
        </p>
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
          <button type="button" className="btn ghost lg" onClick={onCancel}>
            選び直す
          </button>
          <button type="button" className="btn lg" onClick={onConfirm}>
            {label}
          </button>
        </div>
      </section>
    </div>
  );
}

/** ターン終了の確認。まだ攻撃できるキャラクターや、残っているコストがあれば添える */
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
    attackers > 0 && `まだ攻撃できるキャラクターが ${attackers} 体います`,
    mana > 0 && `コストが ${mana} 残っています`,
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

/** 対戦の途中で「戻る」「ロビーへ」を押したときの確認（押し間違いで対戦から抜けないように） */
function QuitConfirm({
  question,
  notes,
  onYes,
  onNo,
}: {
  question: string;
  notes: string[];
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);
  return (
    <div className="zoom-sheet end-confirm" role="alertdialog" aria-modal="true" aria-label="退出の確認">
      <button type="button" className="zoom-sheet-bg" aria-label="やめる" onClick={onNo} />
      <div className="end-confirm-body">
        <p className="end-confirm-q">{question}</p>
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
            退出する
          </button>
        </div>
      </div>
    </div>
  );
}

/** バズの確認：対象のキャラクターと、バズしたあとの攻撃力・体力・残りの回数を見せる */
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
              <span>突進が付く</span>
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
  /** 最初から闇堕ちの姿で開く（墓地から闇堕ちさせる前の確認用） */
  dark?: boolean;
};

/** ドラッグしているもの（手札のカード／攻撃するキャラクター） */
type DragSrc = { kind: "hand"; index: number } | { kind: "unit"; slot: number };

/** 攻撃したときの見込み（与えるダメージ・破壊できるか）を、攻撃先に重ねて出す */
function AttackBadge({ pv, leader }: { pv: AttackPreview; leader?: boolean }) {
  const tag = leader
    ? pv.kills && "とどめ"
    : pv.kills && pv.dies
      ? "相打ち"
      : pv.kills
        ? "墓地"
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

/** 攻撃するキャラクターから指先（攻撃先）へ伸ばす矢印 */
function AttackArrow({
  from,
  to,
  hot,
  ally,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  hot: boolean;
  /** 味方を狙う呪文（緑の矢印） */
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

/**
 * 対象を取らない呪文：カードからバトル場（.post-zone）の真ん中へ、上へ流れる点線の矢印。「場へ投げれば使える」をさりげなく示す。
 * from を渡さなければ、手札で選んでいるカードの上から伸ばす。場と手札の位置は毎フレーム測る（カードの持ち上がり・画面の大きさの変化に付いていく）
 */
function PostThrowArrow({ from }: { from: { x: number; y: number } | null }) {
  const path = useRef<SVGPathElement>(null);
  const head = useRef<SVGPolylineElement>(null);
  const fromRef = useRef(from);
  fromRef.current = from;
  useLayoutEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const p = path.current;
      const h = head.current;
      if (!p || !h) return;
      const zone = document.querySelector(".post-zone")?.getBoundingClientRect();
      const card = document.querySelector(".pstage .hand .mini.selected")?.getBoundingClientRect();
      const s = fromRef.current ?? (card ? { x: card.left + card.width / 2, y: card.top - 6 } : null);
      const to = zone ? { x: zone.left + zone.width / 2, y: zone.top + zone.height / 2 } : null;
      // 場の真ん中より下から伸ばすときだけ（指が場に近づいたら消す）
      if (!s || !to || s.y - to.y < 40) {
        p.setAttribute("d", "");
        h.setAttribute("points", "");
        return;
      }
      const cy = (s.y + to.y) / 2;
      p.setAttribute("d", `M${s.x},${s.y} Q${s.x},${cy} ${to.x},${to.y}`);
      const a = Math.atan2(to.y - cy, to.x - s.x);
      const wing = (k: number) => `${to.x - 11 * Math.cos(a - k * 0.6)},${to.y - 11 * Math.sin(a - k * 0.6)}`;
      h.setAttribute("points", `${wing(1)} ${to.x},${to.y} ${wing(-1)}`);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg className="throw-arrow" aria-hidden="true">
      <path ref={path} />
      <polyline ref={head} />
    </svg>
  );
}

/** 見せ終わったオープニングの番号（store の opening） */
let openingSeen = 0;

/**
 * 対戦の画面。CPU 戦とオンライン対戦で共通（onQuit を渡すと「戻る」でそれを呼ぶ）。
 * 決着の前に「戻る」を押したら、確認を出してから抜ける。quitNotes はその確認に添える説明（オンライン対戦の、抜けたあとどうなるか）
 */
export function Board({ onQuit, quitNotes }: { onQuit?: () => void; quitNotes?: string[] } = {}) {
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
    darkFall,
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
  /** 「戻る」の確認を出しているか */
  const [quitAsk, setQuitAsk] = useState(false);
  // 確認を出している間に決着したら閉じる（「もう一度」の次の対戦で出し直さない）
  const decided = !!game?.winner;
  useEffect(() => {
    if (decided) setQuitAsk(false);
  }, [decided]);
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
  /** ネ申の降臨：手札に加えるカード（画面の真ん中に大きく見せる）。場の後ろの層と画面座標の層を出す */
  const [god, setGod] = useState<{ id: number; gifts: string[] } | null>(null);
  const godField = useRef<HTMLDivElement>(null);
  const godOver = useRef<HTMLDivElement>(null);
  /** クサハミの召喚（通常の姿・闇の姿）：場の後ろの層（草原）。描いている間だけ置く */
  const [ambush, setAmbush] = useState<number | null>(null);
  const ambushField = useRef<HTMLDivElement>(null);
  /** 毒の茨の演出で場に出した闇の姿の uid。出来事に合わせた裏返し（flipCard）は出さない */
  const withered = useRef(new Set<number>());
  /** 降臨で場に出る神・ライブ演出で出るアイドル・茂みから飛び出すクサハミ・貼り重ねで出る伝説のコラ画像・顔を出すミナモ。ふつうの着地の代わりに、godDescent・idolLive・kusahamiAmbush・collagePaste・minamoLive が見せる */
  const descending = useRef(new Set<number>());
  /** 降臨で神から手札へ飛ばし終えたカードの数。山札から引く演出を出さない */
  const handedOver = useRef(0);
  const [trashView, setTrashView] = useState<PlayerId | null>(null);
  /** 対戦の記録（縦の舞台では下から出る一覧） */
  const [logOpen, setLogOpen] = useState(false);
  const seen = useRef(0);
  /** 見せ終わったオープニング（画面を作り直しても、同じ対戦で見せ直さない） */
  const [openSeen, setOpenSeen] = useState(openingSeen);
  // テストなど、オープニングの長さが 0 のときは見せない
  const openingOn = opening > openSeen && openingMs() > 0;
  const foeDeck = useMemo(() => foeDeckSel(foeDeckRef), [foeDeckRef]);
  /** プレイヤーへの攻撃が当たった瞬間に先に見せたライフ（state が進むまでの間の表示）。同じ出来事の数字を二重に出さないためにも使う */
  const [lpHit, setLpHit] = useState<{ player: PlayerId; lp: number } | null>(null);
  const hitShown = useRef<{ player: PlayerId; lp: number } | null>(null);
  /** 出来事に合わせて出した演出（数字・バナーなど）が見え終わる時刻（performance.now()） */
  const fxUntil = useRef(0);
  /** 決着したあと、結果を出したか（最後の一撃を見せ終えてから出す）。"broke" は、帯が砕けて暗転したあと（明けるのと同時に見せる） */
  const [resultOpen, setResultOpen] = useState<false | "plain" | "broke">(false);
  // 攻撃のあと state が進んだら、本当のライフの表示に戻す
  // biome-ignore lint/correctness/useExhaustiveDependencies: game が変わったときだけ戻す
  useEffect(() => setLpHit(null), [game]);
  const { stage, probe } = useStage();
  /** ターン終了の確認を出しているか（押し間違いで終わらないように） */
  const [confirmEnd, setConfirmEnd] = useState(false);
  /** バズの確認を出している自分のキャラクターの枠（キャラクターを選んでからバズを押すと出る） */
  const [buzzAsk, setBuzzAsk] = useState<number | null>(null);
  // 説明を出している裏向きのカード（持ち主と枠）
  const [omenAsk, setOmenAsk] = useState<{ owner: PlayerId; slot: number } | null>(null);
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
        ? openSlots(g, ME).length > 0
        : !card.target || castTargets(g, ME, id, CATALOG).length > 0)
    );
  };

  // 手札を枠・対象へ、場のキャラクターを攻撃先へ引っぱって離す（シャドバのような操作。タップでの操作もそのまま使える）
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
        if (card.type === "icon")
          return where === "slot" && slotOpen(g, ME, slot) ? play(slot) : select(null);
        if (card.target) {
          const ok = castTargets(g, ME, card.id, CATALOG).some(
            (t) =>
              (where === "foe" && t.side === "enemy" && t.slot === slot) ||
              (where === "ally" && t.side === "ally" && t.slot === slot),
          );
          return ok ? cast({ side: where === "foe" ? "enemy" : "ally", slot }) : select(null);
        }
        // 対象を取らない呪文は、手札より上の場所で離せば使う
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
        // プレイヤーへの攻撃は、当たった瞬間にライフの表示を減らす（演出のあとでもう一度減ったように見せない）
        const foeId: PlayerId = a.player === ME ? CPU : ME;
        let lp: number | undefined;
        let leaderHit: { dealt: number; blocked: boolean } | undefined;
        if (a.target.kind === "leader") {
          try {
            const res = applyAction(g, a, CATALOG);
            lp = res.state.players[foeId].lp;
            // 守り（盾・無敵）に当たったら、攻撃力ではなく実際に通ったダメージを出す（止めたら金の 0）
            const blocked = res.events.some(
              (e) => e.type === "shield" && e.kind === "blocked" && e.player === foeId,
            );
            const dealt = res.events.reduce(
              (n, e) => (e.type === "leaderDamaged" && e.player === foeId ? n + e.amount : n),
              0,
            );
            leaderHit = { dealt, blocked };
          } catch {
            lp = undefined;
          }
        }
        return animateAttack(g, a.player, a.from, a.target, CATALOG, {
          leaderHit,
          onImpact: () => {
            if (lp === undefined || lp === g.players[foeId].lp) return;
            hitShown.current = { player: foeId, lp };
            setLpHit({ player: foeId, lp });
          },
        });
      },
      turnIntro: 1100,
      resolveEffects: async (shown, a, events, next, show) => {
        const visible = hasVisibleEffects(events);
        const cardId = events.find((e) => e.type === "played" || e.type === "cast");
        const card = cardId && "cardId" in cardId ? CATALOG[cardId.cardId] : undefined;
        const attr = card?.attributes[0];
        const tint = attr ? ATTR_META[attr].color : undefined;
        if (a.type === "cast") {
          // 自分の呪文も、使ったカードを真ん中に見せてから効果を飛ばす（相手の呪文は revealFoe で見せ済み）
          if (a.player === ME && card) {
            const id = Date.now();
            setReveal({ id, cardId: card.id, kind: "cast", mine: true });
            setTimeout(() => setReveal((r) => (r?.id === id ? null : r)), 1000);
            await wait(visible ? 620 : 900);
          }
          const f = frameRect();
          const from = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
          await presentPhased(shown, events, next, { from, tint }, show);
        } else if (a.type === "attack") {
          // 攻撃で倒れて、【破壊されたとき】にキャラクターが出るとき（攻撃の演出は beforeAttack で見せ終えている）。
          // 倒れたキャラクターが消え終わってから出す
          const atk = shown.players[a.player].field[a.from];
          const from = atk ? document.querySelector<HTMLElement>(`[data-uid="${atk.uid}"]`) : null;
          await presentPhased(shown, events, next, { from, tint: undefined }, show);
        } else if (a.type === "play") {
          const does = (x: string) => !!card?.effects.some((f) => f.do === x);
          const uid = next.players[a.player].field[a.slot]?.uid;
          // 出たキャラクターが着地した瞬間から、運営サイドの演出を始める
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
            await animateJudge(shown, events, next, uid, async (g, rest) => {
              await presentPhased(g, rest, next, { from: null }, show);
            });
            setArbiter((x) => (x?.id === id ? { id, leaving: true } : x));
            return;
          }
          // 出たキャラクターの要素（画面に描かれてから探す）
          const self = () =>
            uid !== undefined ? document.querySelector<HTMLElement>(`[data-uid="${uid}"]`) : null;
          if (card && uid !== undefined && GOD_DESCENT_CARDS.has(card.id) && fxEnabled()) {
            // ネ申：ふつうの着地の代わりに降臨を見せ、手札に加えるカードは山札からではなく神から出す。
            // 描かれる前に印を付けて、着地の演出を止めておく（この行より前に await を置かない）
            descending.current.add(uid);
            const gifts = events.flatMap((e) =>
              e.type === "drew" && e.player === a.player ? [e.cardId] : [],
            );
            setGod({ id: Date.now(), gifts });
            await gwait(50);
            const unitEl = self();
            const field = godField.current;
            const over = godOver.current;
            let cur = shown;
            if (unitEl && field && over) {
              handedOver.current += gifts.length;
              await godDescent({
                unit: unitEl,
                field,
                over,
                gifts: [...over.querySelectorAll<HTMLElement>(".gd-gift")],
                mine: a.player === ME,
                toHand: async (i) => {
                  const id = gifts[i];
                  if (!id) return null;
                  const p = cur.players[a.player];
                  cur = { ...cur, players: { ...cur.players, [a.player]: { ...p, hand: [...p.hand, id] } } };
                  show(cur);
                  await gwait(20);
                  if (a.player !== ME) return document.querySelector<HTMLElement>(`[data-hand="${CPU}"]`);
                  const cards = document.querySelectorAll<HTMLElement>(
                    `[data-hand="${ME}"] [data-hand-card]`,
                  );
                  const el = cards[cards.length - 1] ?? null;
                  if (el) el.style.opacity = "0";
                  return el;
                },
              });
            }
            descending.current.delete(uid);
            setGod(null);
            if (visible) await animateEffects(cur, events, next, { from: self(), tint });
            return;
          }
          // ★5のアイドル：ふつうの着地の代わりにライブ演出（暗転・スポットライト・ペンライト）を見せる。
          // 伝説のコラ画像：ふつうの着地の代わりに、紙がめくれるたびに切れ端が場を貼り埋める演出を見せる。
          // 描かれる前に印を付けて、着地の演出を止めておく（この行より前に await を置かない）
          let live = false;
          if (
            card &&
            uid !== undefined &&
            (IDOL_LIVE[card.id] || COLLAGE_PASTE.has(card.id)) &&
            fxEnabled()
          ) {
            descending.current.add(uid);
            await gwait(50);
            const unitEl = self();
            if (unitEl) {
              if (IDOL_LIVE[card.id]) await idolLive({ unit: unitEl, layer: fxLayer(), cardId: card.id });
              else await collagePaste({ unit: unitEl, layer: fxLayer(), art: card.art });
              unitEl.style.opacity = "";
              live = true;
            }
            descending.current.delete(uid);
          }
          // ミナモ：ふつうの着地の代わりに、カードを画面の中央で大きくアップにして（絵は水だけになる）上の縁からひょこっと顔を出し、真下に配信のコメント欄を流す。
          // 描かれる前に印を付けて、着地の演出を止めておく（この行より前に await を置かない）
          const minamo = card ? MINAMO_LIVE[card.id] : undefined;
          if (card && uid !== undefined && minamo && card.subject && fxEnabled()) {
            descending.current.add(uid);
            await gwait(50);
            const unitEl = self();
            if (unitEl) {
              await minamoLive({
                unit: unitEl,
                layer: fxLayer(),
                subject: card.subject,
                bg: minamo.bg,
                name: card.name,
                epithet: minamo.epithet,
              });
              unitEl.style.opacity = "";
              live = true;
            }
            descending.current.delete(uid);
          }
          // クサハミ：ふつうの着地の代わりに、茂みから飛び出して斬る演出（草原は場の後ろの層に描く）。
          // 描かれる前に印を付けて、着地の演出を止めておく（この行より前に await を置かない）
          if (card && uid !== undefined && KUSAHAMI_AMBUSH.has(card.id) && fxEnabled()) {
            descending.current.add(uid);
            setAmbush(Date.now());
            await gwait(50);
            const unitEl = self();
            const field = ambushField.current;
            if (unitEl && field) {
              await kusahamiAmbush({ unit: unitEl, field, layer: fxLayer() });
              unitEl.style.opacity = "";
              live = true;
            }
            descending.current.delete(uid);
            setAmbush(null);
          }
          // 効果でキャラクター（トークンなど）を出すなら、出したキャラクターが着地してから、1体ずつ時間差で出す
          const summons = events.some((e) => e.type === "summoned");
          if (!visible && !summons) return;
          if (live) await wait(200);
          else if (summons) await touch();
          else await wait(560); // 出たキャラクターが場に着いて弾むのを待ってから、効果を出す
          await presentPhased(shown, events, next, { from: self(), tint }, show);
        } else if (a.type === "sacrifice") {
          // 差し出しが決まった：選ばれたキャラクターを、真上で溜めた黒い閃光で貫く（黒い場はターンが終わるまで残す）
          const uids = events.flatMap((e) =>
            e.type === "sacrificed" ? [shown.players[e.player].field[e.slot]?.uid ?? -1] : [],
          );
          if (uids.length === 0) return;
          // 選んだら、案内が消えて盤面が明るく戻るのを見せてから貫く
          await gwait(320);
          const pierced = await animateSacrifice(shown, events, ME);
          // 貫いたキャラクターは墓地へ送り終えているので、残りのいなくなるキャラクターだけを送る
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
          await presentPhased(left, events, next, { from: null }, show);
        } else {
          // 闇堕ちで戻る毒草喰らいのクサハミ：全画面の演出のあと、枯れた草原が毒の茨になる演出で場に出す
          // （ふつうの着地・裏返しの代わり）。描かれる前に印を付けて、着地の演出を止めておく
          let cur = shown;
          for (const e of events) {
            if (e.type !== "darkFall" || !KUSAHAMI_AMBUSH.has(e.cardId) || !fxEnabled()) continue;
            const unit = next.players[e.player].field[e.slot];
            if (!unit || unit.cardId !== e.cardId) continue;
            descending.current.add(unit.uid);
            withered.current.add(unit.uid);
            setAmbush(Date.now());
            const p = cur.players[e.player];
            cur = {
              ...cur,
              players: {
                ...cur.players,
                [e.player]: { ...p, field: p.field.map((u, k) => (k === e.slot ? unit : u)) },
              },
            };
            show(cur);
            await gwait(50);
            const unitEl = document.querySelector<HTMLElement>(`[data-uid="${unit.uid}"]`);
            const field = ambushField.current;
            if (unitEl && field) {
              await kusahamiWither({ unit: unitEl, field, layer: fxLayer() });
              unitEl.style.opacity = "";
            }
            descending.current.delete(unit.uid);
            setAmbush(null);
          }
          await presentPhased(cur, events, next, { from: null }, show);
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
          // 対象がある呪文は、狙われたキャラクターを光らせる（相手から見た enemy＝こちらのキャラクター）
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

  // キャラクターが場に新しく現れたら、その場で着地の演出（溜め → 叩きつけ → 衝撃 → 余韻）。
  // 出来事（ログ）ではなく画面に現れた時点で動かすので、登場時の効果より先に着地する
  // （効果があるとき、store は出したキャラクターだけを先に置いた盤面を見せてから効果を見せる）
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
      if (stagedAces.current.delete(u.uid) || descending.current.has(u.uid)) {
        // 『演出家』で上がるエース・降臨するネ申・ライブ演出で出るアイドル・茂みから飛び出すクサハミ・伝説のコラ画像・顔を出すミナモは、描かれる前に隠して、それぞれの演出に任せる
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
    // 出した演出がすべて見え終わるまでの長さ（決着の演出は、これを待ってから始める）
    let until = 0;
    const hold = (ms: number) => {
      until = Math.max(until, ms);
    };
    // この中でバズしたキャラクター（続く buffed は便乗）と、便乗を見せた数
    let buzzUid: number | undefined;
    let riders = 0;
    for (const { id, e, fx } of fresh) {
      // 効果の演出で見せ終わった数字は出さない
      if (fx && (e.type === "damaged" || e.type === "leaderDamaged" || e.type === "leaderHealed")) continue;
      if (e.type === "turnStarted") {
        // 『フィクサー』の黒い場は、出したターンが終わったら滲んで戻る
        fixerApi.current?.close();
        setBanner({ id, mine: e.player === ME, turn: e.turn });
        t += 950;
        hold(t);
      } else if (e.type === "drew") {
        // ネ申の降臨で、神から手札へ飛ばし終えたカード
        if (fx && handedOver.current > 0) {
          handedOver.current--;
          continue;
        }
        void animateDraw(e.player, t);
        hold(t + 560);
        t += 180;
      } else if (e.type === "leaderHealed") {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `+${amount}`, "heal"), t);
        hold(t + 700);
      } else if (e.type === "leaderDamaged" && !fresh.some((l) => l.e.type === "battle")) {
        // プレイヤーへの攻撃のダメージは、当たった瞬間に見せ終わっている
        const shown = hitShown.current;
        if (shown && shown.player === e.player && shown.lp === e.lp) {
          hitShown.current = null;
          continue;
        }
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `-${amount}`, "dmg"), t);
        hold(t + 700);
      } else if (e.type === "damaged") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => popDamage(uid, e.amount), t);
        hold(t + 700);
      } else if (e.type === "buzz") {
        // バズで数字が変わった瞬間に、攻撃力・体力の丸を軽く弾ませる
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => markBuzzed(uid), t);
        buzzUid = uid;
        hold(t + 400);
      } else if (e.type === "buffed" && !fx && e.cause === "tokenLost") {
        // 攻撃で草が破壊されて強くなった（クサハミ）：草が消え終わってから「+N」を見せ、数字を上げる
        const uid = uidAt(e.player, e.slot);
        if (uid) showGrowth(uid, e, t + 450);
        hold(t + 1210);
      } else if (e.type === "buffed" && !fx && buzzUid !== undefined) {
        // 便乗：バズしたキャラクターの数字が変わったあとに、便乗のキャラクターへ1体ずつ光を飛ばして数字を上げる
        const uid = uidAt(e.player, e.slot);
        if (uid) {
          const at = t + 320 + riders++ * 240;
          showRiding(buzzUid, uid, e, at);
          hold(at + 900);
        }
      } else if (e.type === "darkFall" || e.type === "restored") {
        const uid = uidAt(e.player, e.slot);
        // 毒の茨の演出で出した闇の姿は、もう場に出ているので裏返さない
        if (uid && withered.current.delete(uid)) continue;
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
        hold(t + 980);
      }
    }
    if (until > 0) fxUntil.current = Math.max(fxUntil.current, performance.now() + until);
  }, [log, openingOn]);

  // 決着：最後の一撃（ダメージの数字・ライフが 0 になるところ）やターン開始のバナーを見せ終えてから、
  // 負けた側のプレイヤーの帯が砕け、破片がこちらへ飛んできて暗転し、明けたら結果（fx/lifeBreak.ts）。
  // 山札切れ・特殊勝利は、砕ける前にきっかけ（空の山札・勝ったカード）を光らせる。降参・時間切れも同じ流れ
  const winner = game?.winner ?? null;
  useEffect(() => {
    setResultOpen(false);
    if (!winner) return;
    if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function") {
      setResultOpen("plain");
      return;
    }
    let live = true;
    let fx: LifeBreak | null = null;
    const loser: PlayerId = winner === ME ? CPU : ME;
    const s = useGame.getState();
    const end = [...s.log].reverse().find((l) => l.e.type === "deckOut" || l.e.type === "specialWin")?.e;
    void (async () => {
      // 動きを減らす設定のときは砕けず、少し長く盤面を見せてから結果を出す
      const motion = fxEnabled();
      await gwait(Math.max(motion ? END_SETTLE : END_SETTLE * 2, fxUntil.current - performance.now()));
      if (!live) return;
      if (!motion) return setResultOpen("plain");
      if (end?.type === "deckOut") {
        await endCue(document.querySelector<HTMLElement>(`[data-pile="deck-${end.player}"]`), "deckOut");
      } else if (end?.type === "specialWin") {
        const u = s.game?.players[end.player].field.find((x) => x?.cardId === end.cardId);
        await endCue(u ? document.querySelector<HTMLElement>(`[data-uid="${u.uid}"]`) : null, "specialWin");
      }
      const bar = document.querySelector<HTMLElement>(`[data-master="${loser}"]`);
      if (!live) return;
      if (!bar) return setResultOpen("plain");
      fx = lifeBreak(bar, {
        layer: fxLayer(),
        frame: frameRect(),
        board: document.querySelector<HTMLElement>(".pstage"),
        gauge: bar.querySelector<HTMLElement>(".lp-bar"),
        // 破片の色味は、負けた側のライフのゲージの色
        tint: loser === ME ? "#8fdcfb" : "#ffb0b8",
        onCovered: () => {
          if (live) setResultOpen("broke");
        },
      });
    })();
    return () => {
      live = false;
      fx?.cancel();
    };
  }, [winner]);

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
  const sacSlots = game.pending?.waiting.includes(ME) && !animating ? sacrificeCandidates(game, ME) : [];
  // 差し出しの案内：何の効果で、いま何をすればいいか。選べる自分のキャラクター以外は暗くして押せなくする。
  // 選び終えて破壊の演出をしている間（animating）は、案内も暗さも消す（案内を消してから貫く）
  const sacGuide = (() => {
    const pend = game.pending;
    if (!pend || game.winner || animating) return null;
    const src = [...me.field, ...foe.field].find((u) => u?.uid === pend.sourceUid);
    return { source: src ? nameOf(src.cardId) : null, mine: sacSlots.length > 0 };
  })();
  const attacking = selection?.kind === "attacker";
  const selectedCard = selection?.kind === "hand" ? CATALOG[me.hand[selection.index] ?? ""] : undefined;
  const postSelected = selectedCard?.type === "post";
  const castOptions: CastTarget[] =
    postSelected && selection?.kind === "hand"
      ? castTargets(game, ME, me.hand[selection.index] as string, CATALOG)
      : [];
  const canCastOn = (side: "enemy" | "ally", slot: number) =>
    castOptions.some((t) => t.side === side && t.slot === slot);
  // 対象を取らない呪文を選んだ・引っぱっているあいだは、バトル場ぜんたいが置き場だと控えめに示す（字は出さない）
  const throwHint =
    myTurn &&
    selectedCard?.type === "post" &&
    !selectedCard.target &&
    effectiveCost(game, ME, selectedCard.id, CATALOG) <= me.mana &&
    !zoom &&
    !logOpen &&
    !confirmEnd;
  // 手札より上で離せば使う（onDrop と同じ判定）
  const throwOver = throwHint && drag?.src.kind === "hand" && drag.over !== null && drag.over !== "hand";
  const targets = attacking ? attackTargets(game, ME, selection.slot, CATALOG) : [];
  const buzzing = selection?.kind === "buzz";
  const buzzWhy = buzzBlock(game, ME);
  const canBuzz = myTurn && !buzzWhy;
  // バズの対象：いま選んでいる自分のキャラクター（攻撃のために選んだもの・押して説明を出したもの）
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
  const freeSlot = openSlots(game, ME)[0] ?? -1;
  // いま闇堕ちさせられる自分の裏向きのカードの枠（破壊されたターンは闇堕ちできない）
  const fallSlots = myTurn ? darkFallSlots(game, ME) : [];
  const askedOmen = omenAsk ? omenAt(omenAsk.owner, omenAsk.slot) : undefined;
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
          <em className="mini-ready">{u.attacksLeft > 1 ? "2回攻撃可" : u.rushOnly ? "突進" : "攻撃可"}</em>
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
          // キャラクターは、出す枠を自分で選んだときだけ出す（もう一度押しても勝手に出さず、選ぶのをやめる）
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
      cut={damageCutOn(game, CPU)}
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
      cut={damageCutOn(game, ME)}
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
    <div className="row foe-row">
      {SLOT_KEYS.map((key, slot) => {
        const u = foe.field[slot];
        return u ? (
          unitCard(CPU, slot, u)
        ) : omenAt(CPU, slot) ? (
          <button
            key={key}
            type="button"
            data-slot={`${CPU}:${slot}`}
            className={`slot omen-slot ${slot === 2 ? "center" : ""}`}
            aria-label={`裏向きの${nameOf(omenAt(CPU, slot)?.cardId ?? "")}（押すと説明）`}
            onClick={() => setOmenAsk({ owner: CPU, slot })}
          >
            <OmenCard />
          </button>
        ) : (
          <div key={key} data-slot={`${CPU}:${slot}`} className={`slot ${slot === 2 ? "center" : ""}`} />
        );
      })}
    </div>
  );
  const meRow = (
    <div className="row">
      {SLOT_KEYS.map((key, slot) => {
        const u = me.field[slot];
        if (u) return unitCard(ME, slot, u);
        const omen = omenAt(ME, slot);
        if (omen) {
          const ready = fallSlots.includes(slot);
          return (
            <button
              key={key}
              type="button"
              data-slot={`${ME}:${slot}`}
              className={`slot omen-slot ${slot === 2 ? "center" : ""} ${ready ? "omen-ready" : ""}`}
              aria-label={`裏向きの${nameOf(omen.cardId)}（押すと説明${ready ? "。闇堕ちさせられる" : ""}）`}
              onClick={() => setOmenAsk({ owner: ME, slot })}
            >
              <OmenCard />
            </button>
          );
        }
        const drop = myTurn && selection?.kind === "hand" && !postSelected;
        return (
          <button
            key={key}
            type="button"
            data-drop={`slot:${slot}`}
            data-slot={`${ME}:${slot}`}
            className={`slot ${slot === 2 ? "center" : ""} ${drop ? "droppable" : ""} ${drop && drag?.over === `slot:${slot}` ? "drop-over" : ""}`}
            disabled={!drop}
            aria-label={`空き枠 ${slot + 1}${slot === 2 ? "（センター）" : ""}`}
            onClick={() => play(slot)}
          />
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
        // キャラクターを選んであれば確認を出す。選んでいなければ、選ぶところから
        if (buzzTarget !== null) return setBuzzAsk(buzzTarget);
        select({ kind: "buzz" });
      }}
      disabled={!canBuzz && !buzzing}
      title={buzzWhy ?? "選んだ自分のキャラクター1体に攻撃力+2・体力+2・突進"}
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
    <button
      type="button"
      className="btn ghost quit"
      onClick={() => (game.winner ? quit() : setQuitAsk(true))}
    >
      {online ? "ロビーへ" : "戻る"}
    </button>
  );
  /** 選んだカード（手札・攻撃するキャラクター）をやめて、手札を元の形に戻す */
  const cancelSelection = () => {
    if (selection) select(null);
  };
  const field = fieldOf(game, CATALOG);
  const boardClass = `board turn-${game.active === ME ? "me" : "foe"}${field ? ` field-${field.kind}` : ""}${director !== null ? " field-director" : ""}${arbiter ? " field-arbiter" : ""}${fixer ? " field-fixer" : ""}${god ? " field-god" : ""}${sacGuide ? " sac-mode" : ""}`;
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
          {god && <div key={god.id} className="god-field" ref={godField} aria-hidden="true" />}
          {ambush !== null && (
            <div key={ambush} className="kusa-field" ref={ambushField} aria-hidden="true" />
          )}
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
            {throwHint && <div className={`post-zone ${throwOver ? "over" : ""}`} aria-hidden="true" />}
            {foeRow}
            {/* 場と場の間には何も置かない（反則のときだけ、短く知らせて消える）。例外は、差し出しのように選ぶまで進めない場面の案内 */}
            {sacGuide && (
              <div className={`sac-guide ${sacGuide.mine ? "mine" : "wait"}`} role="status">
                {sacGuide.source && <small>{sacGuide.source}の効果</small>}
                {sacGuide.mine ? (
                  <>
                    <strong>破壊する自分のキャラクターを1体選んでください</strong>
                    <span>相手も1体選び、選ばれたキャラクターは同時に破壊されます</span>
                  </>
                ) : (
                  <strong>相手が破壊するキャラクターを選んでいます</strong>
                )}
              </div>
            )}
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

      {god && (
        // ネ申の降臨：光の玉・閃光と、手札に加えるカード（画面座標で置く。動きは fx/godDescent.ts）
        <div key={god.id} className="vp-layer god-over" ref={godOver} aria-hidden="true">
          {god.gifts.map((id, i) => {
            const card = CATALOG[id];
            return card ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが並ぶこともあり、並びの位置そのものが目印
              <div key={i} className="gd-gift">
                <HoloCard card={card} idle={false} />
                <i className="gd-sheen" />
              </div>
            ) : null;
          })}
        </div>
      )}

      {throwHint && !drag && (
        // 対象を取らない呪文を押して選んだだけのときも、同じ矢印で「場へ」を示す
        <div className="vp-layer">
          <PostThrowArrow from={null} />
        </div>
      )}

      {drag && (
        // 指の位置に付いてくる表示は画面座標で置くので、画面座標の層（.vp-layer。frame.ts）に入れる
        <div className="vp-layer">
          {(() => {
            // 対象を取る呪文と攻撃は、カードから指先へ矢印を伸ばす（狙う相手が指やカードで隠れないように）
            const handId = drag.src.kind === "hand" ? me.hand[drag.src.index] : undefined;
            const handCard = handId ? CATALOG[handId] : undefined;
            if (
              drag.src.kind === "hand" &&
              handId &&
              handCard &&
              !(handCard.type === "post" && handCard.target)
            ) {
              // 付いてくるカードの上端（translate(-50%, -62%) scale(s) で置いたカードの、縮める前の高さ h から）
              const h = (drag.width * 88) / 63;
              const top = drag.y - 0.12 * h - (stage.scale * 1.08 * h) / 2;
              return (
                <>
                  {throwHint && !throwOver && <PostThrowArrow from={{ x: drag.x, y: top - 6 }} />}
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
                </>
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
            {reveal.mine ? "あなたの呪文" : `${foeName}が${reveal.kind === "play" ? "出した" : "使った"}`}
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
      {quitAsk && !game.winner && (
        <QuitConfirm
          question={online ? "ロビーに戻りますか？" : "デッキ選びに戻りますか？"}
          notes={online ? (quitNotes ?? []) : ["この対戦は終わります（続きからは遊べません）"]}
          onYes={() => {
            setQuitAsk(false);
            quit();
          }}
          onNo={() => setQuitAsk(false)}
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
      {omenAsk && askedOmen && CATALOG[askedOmen.cardId] && (
        <OmenSheet
          card={CATALOG[askedOmen.cardId] as CardDef}
          owner={omenAsk.owner === ME ? null : foeName}
          ready={omenAsk.owner === ME && fallSlots.includes(omenAsk.slot)}
          onFall={() => {
            setOmenAsk(null);
            darkFall(omenAsk.slot);
          }}
          onClose={() => setOmenAsk(null)}
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
        <div className="sheet" role="dialog" aria-modal="true" aria-label="墓地">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setTrashView(null)} />
          <div className="sheet-body trash-list">
            <h2>
              {trashView === ME ? "あなた" : foeName}の墓地（{game.players[trashView].trash.length}枚）
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

      {game.winner && resultOpen && (
        <Result
          game={game}
          onAgain={online ? undefined : () => start(deck)}
          broke={resultOpen === "broke"}
          onQuit={quit}
          online={online}
          events={log.map((l) => l.e)}
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
  const effect = (dark ? card.dark?.effect : card.effect) ?? "";
  // 効果文に書いていないキーワード（バズなどで付いたもの）だけを札で出す。説明は語を押した先の小窓
  const keywords = (view?.keywords ?? card.keywords).filter((k) => !effect.includes(`${k}。`));
  const states = view
    ? [
        view.exposed && "晒し状態",
        view.unit.exposeAtTurnEnd && "ターンの終わりに晒される",
        view.asleep && "眠り状態",
        view.unit.silenced && "沈黙状態",
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
              : { background: ATTR_META[card.attributes[0] ?? "自然"].deep }
          }
        />
        <span className="ps-body">
          <span className="ps-head">
            <b className="ps-name">{name}</b>
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
                <i className="ps-post">呪文</i>
              )}
            </span>
          </span>
          <span className="ps-effect">
            {keywords.map((k) => (
              <HelpTerm key={k} term={k} className="ps-kw" />
            ))}
            {states.length > 0 && (
              <em className="ps-state">
                <EffectText text={states.join("・")} />
              </em>
            )}
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
  events,
  broke,
}: {
  game: GameState;
  /** 帯が砕けて暗転したあとに出す（画面そのものはじわっと出さず、暗転が明けるのと同時に見せる） */
  broke?: boolean;
  onAgain?: () => void;
  onQuit: () => void;
  online: boolean;
  /** 対戦の記録（決着の原因を出すため） */
  events: GameEvent[];
}) {
  // ランダムマッチなら、レーティングの動き
  const rating = useLive((s) => s.rating);
  const won = game.winner === ME;
  const why = endReason(events, ME, won);
  return (
    <div
      className={`result ${won ? "win" : "lose"}${broke ? " after-break" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="対戦結果"
    >
      <section className="result-body">
        <strong className="result-title">{won ? "勝利！" : "敗北…"}</strong>
        <p className="result-why">
          <b>{why.title}</b>
          {why.detail}
        </p>
        <span className="result-turn">{game.turn} ターン目で決着</span>
        {online && rating && (
          <div className="result-rating g2">
            <p className="result-rating-h">
              <span>ランダムマッチのレート</span>
              <em className={rating.after >= rating.before ? "up" : "down"}>
                {rating.after >= rating.before ? "+" : "−"}
                {Math.abs(rating.after - rating.before)}
              </em>
            </p>
            <p className="result-rating-r">
              <span>{rating.before}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <b>{rating.after}</b>
            </p>
          </div>
        )}
      </section>
      <div className="result-actions">
        {onAgain && (
          <button type="button" className="btn lg" onClick={onAgain}>
            もう一度
          </button>
        )}
        <button type="button" className={onAgain ? "btn ghost lg" : "btn lg"} onClick={onQuit}>
          {online ? "ロビーに戻る" : "デッキを選び直す"}
        </button>
      </div>
    </div>
  );
}

/** 山札（裏向きの束）と墓地（いちばん上のカード）。墓地を押すと一覧を出す */
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
  /** 墓地に闇堕ちできるカードがある（mine＝今出せる／foe＝相手が出してくるかも） */
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
        aria-label={`墓地 ${trash.length}枚を見る`}
      >
        {topCard ? (
          <span
            className="trash-top"
            style={
              topCard.art
                ? { backgroundImage: `url(${topCard.art})` }
                : { background: ATTR_META[topCard.attributes[0] ?? "自然"].deep }
            }
          >
            <i>{topCard.name}</i>
          </span>
        ) : (
          <span className="trash-empty" />
        )}
        <b className="pile-count">{trash.length}</b>
        <small>{dark === "mine" ? "闇堕ち" : "墓地"}</small>
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
  /** 場にガードがいてプレイヤーを攻撃できない */
  guarded?: boolean;
  /** プレイヤーが守られていて、ダメージを受けない */
  shielded?: boolean;
  /** 盾：受けるダメージを1回ごとに減らす数（0 なら無し）。帯の表面に金の膜を張る */
  cut?: number;
  /** このプレイヤーに付いている「次の自分のターンの終わりに受けるダメージ」（0 なら無し） */
  delayed?: number;
  targetable?: boolean;
  /** ドラッグした攻撃が、いまこのプレイヤーの上にある */
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
 * 持ち時間の表示。手番の人は、ターンの残り（30 秒まで）と持ち時間（1 試合 5 分）が一緒に減る。
 * ターンの残り 10 秒・持ち時間 30 秒を切ると赤くなる。手番でない人は、持ち時間の残りだけ。差し出しを選ぶ番なら、その残り
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
  const low = left.bank <= 30_000;
  const hurry = left.running && (left.turn <= 10_000 || low);
  return (
    <span
      className={`pb-clock ${left.running ? "run" : ""} ${low ? "bank" : ""} ${hurry ? "hurry" : ""}`}
      role="timer"
      aria-label={`${who}の${left.running ? `ターンの残り ${formatClock(left.turn)}、` : ""}持ち時間 ${formatClock(left.bank)}`}
    >
      {left.running && <b>{formatClock(left.turn)}</b>}
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
  cut = 0,
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
        {name}のプレイヤー
        {active && <i className="turn-dot" title="この人のターン" />}
        {guarded && <span className="pb-guard">ガードで守られている</span>}
        {shielded && <span className="pb-shield">無敵（次の相手のターンまで）</span>}
        {cut > 0 && <span className="pb-cut">ダメージ-{cut}</span>}
        {delayed > 0 && <span className="pb-delayed">ターンの終わりに{delayed}ダメージ</span>}
        {clock}
      </span>
      <span className="pb-lp">
        ライフ <b key={lp}>{lp}</b>
        <span className="lp-bar">
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="pb-mana" title={`コスト ${mana} / ${maxMana}`}>
        コスト
        <span className="pips">
          {pips.map((on, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: コストの玉は位置そのものが意味を持つ
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
      {cut > 0 && <i className="pb-film" aria-hidden="true" />}
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
          aria-label={`${name}のプレイヤーを攻撃`}
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
