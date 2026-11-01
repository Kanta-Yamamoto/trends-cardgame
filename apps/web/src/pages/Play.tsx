import { type CardDef, type DeckId } from "@trends/cards";
import {
  type AttackPreview,
  type AttackTarget,
  applyAction,
  attackTargets,
  buzzBlock,
  type CastTarget,
  CLOCK,
  canUnitAttack,
  castTargets,
  type DarkOmen,
  DEFAULT_CONFIG,
  damageCutOn,
  darkFallSlots,
  darkOmenAwake,
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
  type TurnOptions,
  turnOptions,
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
import { SOUL } from "../fx/deathSoul";
import { fieldEntry, landed } from "../fx/fieldEntry";
import { GOD_DESCENT_CARDS, godDescent } from "../fx/godDescent";
import { IDOL_LIVE, idolLive } from "../fx/idolLive";
import { KUSAHAMI_AMBUSH, kusahamiAmbush, kusahamiWither } from "../fx/kusahamiAmbush";
import { endCue, type LifeBreak, lifeBreak } from "../fx/lifeBreak";
import { MINAMO_LIVE, minamoLive } from "../fx/minamoLive";
import { fxEnabled } from "../fx/stage";
import { warmFx } from "../fx/warm";
import { ArbiterField } from "../game/ArbiterField";
import { beforeBuffs } from "../game/beforeBuffs";
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
  animateReturn,
  animateSacrifice,
  canShowDraw,
  DRAW_MS,
  DRAW_STEP_MS,
  flipCard,
  fxLayer,
  hasVisibleEffects,
  markBuzzed,
  popDamage,
  popMaster,
  retireUnits,
  showRiding,
  summonCue,
} from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { endReason } from "../game/result";
import { CATALOG, CPU, DECK_INFO, holdOpening, ME, openingMs, setPresenter, useGame } from "../game/store";
import { useDragPlay } from "../game/useDragPlay";
import { type ClockLeft, formatClock, useClockLeft, useLive } from "../online/live";
import { playMusicOnce, usePageMusic } from "../sound/music";
import { SoundMenu } from "../sound/SoundMenu";
import { playSe } from "../sound/se";
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

/** その枠のキャラクターを除いた state */
function withoutSlot(cur: GameState, player: PlayerId, slot: number): GameState {
  const p = cur.players[player];
  return {
    ...cur,
    players: { ...cur.players, [player]: { ...p, field: p.field.map((x, i) => (i === slot ? null : x)) } },
  };
}

const slotEl = (player: PlayerId, slot: number) =>
  document.querySelector<HTMLElement>(`[data-slot="${player}:${slot}"]`);

/**
 * 出来事を、効果でキャラクターが出たところ（summoned）と、【破壊されたとき】が働いたところ（deathTriggered）で区切って、前から順に見せる。
 * 区切りの前の出来事（出たこと・効果が当たる・破壊されたキャラクターが消える）を見せ終えてから、
 * 出す枠への合図（summonCue）のあとに、出たキャラクターを1体ずつ置く。
 * だから【場に出たとき】に出すものは出したキャラクターの着地のあとに出る。合図は from（効果の出どころ）から飛ばす。
 *
 * 【破壊されたとき】（10月29日）：働くキャラクターは、破壊されても墓地へ送らず、抜け殻にして枠に残す。
 * 相手と一緒に倒れたら、相手が消え始めるのと同時に、抜け殻から魂が抜け出て効果の先へ飛び（fx/deathSoul.ts）、当たってから抜け殻が墓地へ行く。
 * 【破壊されたとき】に出すキャラクターは、抜け殻が消えたあとに、魂のいた所から合図を飛ばして置く。
 * 見せ終えた state を返す
 */
async function presentPhased(
  shown: GameState,
  events: GameEvent[],
  next: GameState,
  opts: { from: HTMLElement | Point | null; tint?: string; skip?: ReadonlySet<number>; spell?: boolean },
  show: (g: GameState) => void,
): Promise<GameState> {
  const alive = new Set(
    (["p1", "p2"] as const).flatMap((p) => next.players[p].field.flatMap((u) => (u ? [u.uid] : []))),
  );
  // 抜け殻になる破壊（このあとに、そのキャラクターの【破壊されたとき】が働く）の出来事の位置
  const shellAt = new Set<number>();
  events.forEach((e, k) => {
    if (e.type !== "deathTriggered") return;
    for (let j = k - 1; j >= 0; j--) {
      const d = events[j];
      if (d?.type === "destroyed" && d.player === e.player && d.slot === e.slot && d.cardId === e.cardId) {
        shellAt.add(j);
        break;
      }
    }
  });
  let cur = shown;

  /** 出たキャラクターを、合図のあとに置く */
  const place = async (
    e: Extract<GameEvent, { type: "summoned" }>,
    from: HTMLElement | Point | null,
    tint: string,
    soul = false,
  ) => {
    const last = next.players[e.player].field[e.slot];
    // 同じ操作のうちに倒れたなど、最後の state にいないものは置かない（あとの演出に任せる）
    if (!last || last.cardId !== e.cardId || cur.players[e.player].field[e.slot]) return;
    // 出したあとの強化（出したキャラクターに+1/+1 など）は、まだ足さない（「+N」を見せてから数字を上げる）
    const unit = beforeBuffs(last, e.player, e.slot, events, events.indexOf(e) + 1);
    await summonCue(from, slotEl(e.player, e.slot), tint, soul);
    const p = cur.players[e.player];
    cur = {
      ...cur,
      players: {
        ...cur.players,
        [e.player]: { ...p, field: p.field.map((u, k) => (k === e.slot ? unit : u)) },
      },
    };
    show(cur);
    await gwait(soul ? 0 : 280);
  };

  let i = 0;
  while (i < events.length) {
    const head = events[i];
    if (head?.type === "deathTriggered") {
      // 【破壊されたとき】：抜け殻から魂が抜け出て、効果の先へ飛ぶ
      let end = i + 1 + head.size;
      const group = events.slice(i + 1, end);
      // 効果で倒れたキャラクター（すぐあとの破壊）も、当たったところを見せてから一緒に送る
      while (events[end]?.type === "destroyed" && !shellAt.has(end)) end++;
      const effects = [...group, ...events.slice(i + 1 + head.size, end)].filter(
        (e) => e.type !== "summoned",
      );
      const summons = group.filter((e) => e.type === "summoned");
      const unit = cur.players[head.player].field[head.slot];
      const el = unit ? document.querySelector<HTMLElement>(`[data-uid="${unit.uid}"]`) : null;
      const at = slotEl(head.player, head.slot)?.getBoundingClientRect();
      let rose: Point | null = at ? { x: at.left + at.width / 2, y: at.top + at.height / 2 } : null;
      let after = withoutGone(cur, effects, alive);
      if (unit && after.players[head.player].field[head.slot]?.uid === unit.uid)
        after = withoutSlot(after, head.player, head.slot);
      await animateEffects(cur, effects, after, {
        from: rose,
        tint: SOUL.mid,
        skip: opts.skip,
        soul: { el, owner: head.player, onRise: (p) => (rose = p ?? rose) },
      });
      if (end < events.length || summons.length > 0) {
        cur = after;
        show(cur);
      }
      // 出すキャラクター：抜け殻が消えていく間に、魂がそのまま枠へ飛ぶ（2体なら少しずらして同時に）。着いた枠から置く
      const from = rose;
      await Promise.all(
        summons.map(async (e, k) => {
          if (e.type !== "summoned") return;
          await gwait(k * 120);
          await place(e, from, SOUL.mid, true);
        }),
      );
      if (summons.length > 0) await gwait(280);
      i = end;
      continue;
    }
    if (head?.type !== "summoned") {
      let j = i;
      while (j < events.length && events[j]?.type !== "summoned" && events[j]?.type !== "deathTriggered") j++;
      // 抜け殻になるキャラクターは、ここでは墓地へ送らない
      const part = events.slice(i, j).filter((_, k) => !shellAt.has(i + k));
      const after = withoutGone(cur, part, alive);
      const more = j < events.length;
      const summonNext = events[j]?.type === "summoned";
      const soulNext = events[j]?.type === "deathTriggered";
      if (hasVisibleEffects(part))
        await animateEffects(cur, part, after, { ...opts, untilGone: summonNext, soulNext });
      else if (summonNext) await retireUnits(cur, part, after, opts.skip);
      else void retireUnits(cur, part, after, opts.skip);
      // このあとにキャラクターが出る・魂が抜け出るなら、いなくなったキャラクターを画面から除いて、空いた枠を見せる
      if (more && after !== cur) {
        cur = after;
        show(cur);
        if (summonNext) await gwait(120);
      }
      i = j;
      continue;
    }
    await place(head, opts.from, opts.tint ?? "#fff3c4");
    i++;
  }
  return cur;
}

/** 自分のアイコン（アイコンの登録が入るまでは、案内役のちびミナモ） */
const MY_ICON = "/assets/tutorial/minamo-cheer.webp";
const DEFAULT_FOE_ICON = "/assets/cards/c17-art.jpg";
const COST_SLOTS = Array.from({ length: 10 }, (_, i) => i);
/** シートでカードをめくる、指の動きの幅 */
const SWIPE_PX = 50;
/** 自分の手の結果を、手前の文字欄に見せておく時間 */
const BOARD_LINE_MS = 3000;
/** 真ん中の文字欄に出す出来事（引く・ターンの始めなどの細かい動きは出さない） */
const BOARD_LINE_EVENTS = new Set<GameEvent["type"]>([
  "played",
  "cast",
  "battle",
  "leaderDamaged",
  "buzz",
  "darkFall",
  "sacrificed",
  "bounced",
  "stolen",
  "transformed",
]);

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
    case "deathTriggered":
      return `${who(e.player)}の ${nameOf(e.cardId)} の【破壊されたとき】が働いた`;
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
    case "mulliganed":
      return e.count > 0
        ? `${who(e.player)}が手札を${e.count}枚引き直した`
        : `${who(e.player)}は手札を引き直さなかった`;
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
const PORTRAIT_PAD = 8;
const PORTRAIT_GAP = 6;
const fitPortraitSlot = (width: number) => Math.floor((width - PORTRAIT_PAD * 2 - PORTRAIT_GAP * 4) / 5);
/** 場と手札のカードの高さ：舞台が高いほど縦に長く見せる（低い舞台でも、まわりの隙間を残す） */
const fitCard = (height: number) => Math.max(122, Math.min(146, Math.floor(122 + (height - 740) * 0.2)));

export interface Stage {
  width: number;
  height: number;
  scale: number;
  slot: number;
  cx: number;
  cy: number;
  /** 場と手札のカードの高さ */
  card: number;
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
    card: fitCard(height),
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
  // チュートリアルの対戦は、チュートリアルの画面でだけ出す
  const tutorial = useGame((s) => s.mode === "tutorial");
  return <section className="page play">{deck && !tutorial ? <Board /> : <DeckSelect />}</section>;
}

function DeckSelect() {
  const start = useGame((s) => s.start);
  // デッキを選んでいる間（何も動いていないとき）に、演出の舞台を用意しておく
  useEffect(() => warmFx(600), []);
  return (
    <>
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
    <section className="psheet omen-sheet" role="dialog" aria-label={`裏向きの${card.name}`}>
      <p className="ps-note">{state}</p>
      <div className="hs-reel">
        <div className="hs-card">
          <HoloCard card={card} darkForm idle={false} />
        </div>
      </div>
      <p className="ps-note sub">
        {rush}
        {owner === null && !ready && "・いまは出せません"}
      </p>
      <div className="ps-foot">
        <button type="button" className="btn ghost ps-back" onClick={onClose}>
          {ready ? "戻る" : "閉じる"}
        </button>
        {ready && (
          <button type="button" className="btn lg dkc-go" onClick={onFall}>
            闇堕ちさせる
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * 裏向きのカードの印（下の真ん中の白い丸）。破壊されて裏向きになったら砂時計が押され、闇堕ちできるようになった
 * ターン（持ち主のターン）の始めに、2 倍にふくらんでぐるっと一回転し、元の大きさに戻ってから炎に変わる。
 * 裏面（スリーブ）が変わっても読めるよう、裏面とは別に置く
 */
function OmenMark({ awake }: { awake: boolean }) {
  // 印が出たときにすでに闇堕ちできる（読み込み直したときなど）なら、押す動きも回る動きも出さない
  const [born] = useState(awake);
  const was = useRef(awake);
  const [turning, setTurning] = useState(false);
  useEffect(() => {
    if (awake && !was.current) setTurning(true);
    was.current = awake;
  }, [awake]);
  // 印が回り始めるとき（ターンの帯を見せ終えてから。app.css の omen-mark-spin の 1 秒あと）に音を鳴らす
  useEffect(() => {
    if (!turning) return;
    const timer = setTimeout(() => playSe("omenUnlock"), 1000);
    return () => clearTimeout(timer);
  }, [turning]);
  return (
    <span
      className={`omen-mark ${born ? "" : "stamp"} ${awake ? "awake" : ""} ${turning ? "turning" : ""}`}
      aria-hidden="true"
      // 炎が浮かびきったら（回る・入れ替わるの最後）、動きを外す
      onAnimationEnd={(e) => e.animationName === "omen-mark-in" && setTurning(false)}
    >
      <svg className="om-wait" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 2.5h12v1.8h-1.2c0 3.4-1.9 5.6-3.6 7.7 1.7 2.1 3.6 4.3 3.6 7.7H18v1.8H6v-1.8h1.2c0-3.4 1.9-5.6 3.6-7.7C9.1 9.9 7.2 7.7 7.2 4.3H6z" />
        <path
          className="om-cut"
          d="M9.1 4.3h5.8c-.1 1.6-.8 2.9-1.6 4H10.7c-.8-1.1-1.5-2.4-1.6-4zM12 14.2c1.2 1.4 2.6 3 2.8 5.5H9.2c.2-2.5 1.6-4.1 2.8-5.5z"
        />
      </svg>
      <svg className="om-ready" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.6A4.8 4.8 0 0 1 12 18a4.8 4.8 0 0 1-4.8-4.9c0-2.4 1.3-3.9 2.4-5 .2 1.6.9 2.6 1.8 3.1C11.2 8.3 11 5.4 12 2.5z" />
        <path
          className="om-cut"
          d="M12 11.2c.3 1.5 2 2.3 2 4.1a2 2 0 0 1-4 0c0-1.3.9-2.1 2-4.1z"
          opacity=".55"
        />
        <rect x="6" y="19.6" width="12" height="1.8" rx=".9" opacity=".6" />
      </svg>
    </span>
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
  onChoose,
  confirmLabel,
  cta = "対戦する",
}: {
  onPick: (deck: DeckSel) => void;
  /** 押して選んだとき（まだ決めていない。confirmLabel が無いときだけ） */
  onChoose?: (deck: DeckSel) => void;
  confirmLabel?: string;
  cta?: string;
}) {
  // デッキを選んでいる間は、デッキ選びの曲を流す（CPU 戦・オンライン対戦のどちらも）
  usePageMusic("deckSelect");
  const [pending, setPending] = useState<DeckSel | null>(null);
  const [chosen, setChosen] = useState<DeckSel | null>(null);
  /** 「デッキの説明」で開いているデッキ */
  const [about, setAbout] = useState<DeckSel | null>(null);
  const closeAbout = () => setAbout(null);
  // 決まりを守れていない自分のデッキ（属性が2つの、前に組んだデッキなど）は選べない。デッキ構築で直してもらう
  const readMine = useCallback(() => {
    const all = loadCustomDecks();
    const ok = all.filter((d) => deckErrors(d.cards).length === 0);
    return { mine: ok, broken: all.length - ok.length };
  }, []);
  const [{ mine, broken }, setMine] = useState(readMine);
  // アカウントとそろえ終わったら、自分のデッキを読み直す
  useDecksChanged(useCallback(() => setMine(readMine()), [readMine]));
  const pick = (sel: DeckSel) => {
    if (confirmLabel) return setPending(sel);
    setChosen(sel);
    onChoose?.(sel);
  };
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
        <h2>レンタルデッキ</h2>
        <small>{builtins.length}個</small>
      </div>
      <div className="decks">{builtins.map(tile)}</div>
      {!confirmLabel && (
        <>
          <div className="deck-dock-pad" />
          <div className="deck-dock g3">
            <div className="deck-dock-text">
              <b>{chosen?.name ?? "デッキを選んでください"}</b>
              {chosen && (
                <button type="button" className="deck-about" onClick={() => setAbout(chosen)}>
                  デッキの説明 ›
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn"
              data-decide-se
              disabled={!chosen}
              onClick={() => chosen && onPick(chosen)}
            >
              {cta}
            </button>
          </div>
        </>
      )}
      {about && <DeckConfirm deck={about} label="閉じる" onConfirm={closeAbout} onCancel={closeAbout} />}
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
        {deck.points && (
          <ul className="deck-points">
            {deck.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
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
          {onConfirm !== onCancel && (
            <button type="button" className="btn ghost lg" onClick={onCancel}>
              選び直す
            </button>
          )}
          <button type="button" className="btn lg" data-decide-se onClick={onConfirm}>
            {label}
          </button>
        </div>
      </section>
    </div>
  );
}

/** ターン終了の確認に添える、まだできること */
function endNote(o: TurnOptions) {
  return [
    o.attackers > 0 && `攻撃できる ${o.attackers} 体`,
    o.playable > 0 && `出せるカード ${o.playable} 枚`,
    o.buzz && "バズが使えます",
    o.darkFall > 0 && "闇堕ちできます",
  ]
    .filter(Boolean)
    .join("・");
}

/** バズの確認に添える、バズしたあとの攻撃力・体力 */
function buzzNote(v: UnitView) {
  return `攻撃力 ${v.attack} → ${v.attack + DEFAULT_CONFIG.buzzAttack}　体力 ${v.hp} → ${v.hp + DEFAULT_CONFIG.buzzHp}　突進`;
}

/**
 * 手札の引き直し（対戦の始め）。戻すカードを押して選び、決定で送る。
 * 30 秒たったら、そのとき選んでいるカードで送る（deadline はオンライン対戦ならサーバーの時計から。CPU 戦は開いてから 30 秒）
 */
function MulliganSheet({
  hand,
  deadline,
  onDone,
}: {
  hand: string[];
  deadline: number | null;
  onDone: (handIndexes: number[]) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [local] = useState(() => Date.now() + CLOCK.mulliganMs);
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);
  const end = deadline ?? local;
  const left = Math.max(0, Math.min(CLOCK.mulliganMs, end - now));
  const send = (indexes: number[]) => {
    if (sent.current) return;
    sent.current = true;
    onDone([...indexes].sort((a, b) => a - b));
  };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  // 時間が切れたら、選んでいるカードで送る
  // biome-ignore lint/correctness/useExhaustiveDependencies: 残りが 0 になったときだけ送る
  useEffect(() => {
    if (left <= 0) send(picked);
  }, [left <= 0]);
  const toggle = (i: number) => {
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };
  return (
    <section className="psheet mull-sheet" role="dialog" aria-label="手札の引き直し">
      <div className={`mulligan-hand n${hand.length}`}>
        {hand.map((id, i) => {
          const card = CATALOG[id];
          const on = picked.includes(i);
          return card ? (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 手札の位置で選ぶ
              key={i}
              type="button"
              className={`mulligan-card ${on ? "on" : ""}`}
              data-tap-se
              aria-pressed={on}
              aria-label={`${card.name}${on ? "（戻す）" : ""}`}
              onClick={() => toggle(i)}
            >
              <HoloCard card={card} idle={false} />
              {on && <span className="mulligan-mark">戻す</span>}
            </button>
          ) : null;
        })}
      </div>
      <div className="ps-foot">
        <span className={`mulligan-left ${left <= 10_000 ? "hurry" : ""}`}>
          のこり {Math.ceil(left / 1000)} 秒
        </span>
        <button type="button" className="btn lg" data-tap-se onClick={() => send(picked)}>
          {picked.length > 0 ? `${picked.length} 枚引き直す` : "このまま始める"}
        </button>
      </div>
    </section>
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
  if (leader)
    return (
      <span className={`atk-pv leader ${pv.kills ? "kill" : ""}`} aria-hidden="true">
        ここを攻撃 -{pv.toDefender}
        {pv.kills && " とどめ"}
      </span>
    );
  const tag =
    pv.kills && pv.dies ? "相打ち" : pv.kills ? "破壊できる" : pv.dies ? "破壊される" : `-${pv.toDefender}`;
  const tone = pv.kills && pv.dies ? "both" : pv.kills ? "kill" : pv.dies ? "die" : "";
  return (
    <span className={`atk-pv ${tone}`} aria-hidden="true">
      {tag}
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
/** 始めの手札を配り終えたオープニングの番号（画面を作り直しても、同じ対戦で配り直さない） */
let dealtSeen = 0;
/** 次の描画のあと（state を画面に出してから演出を始める） */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * 対戦の画面。CPU 戦とオンライン対戦で共通（onQuit を渡すと「戻る」でそれを呼ぶ）。
 * 決着の前に「戻る」を押したら、確認を出してから抜ける。quitNotes はその確認に添える説明（オンライン対戦の、抜けたあとどうなるか）
 */
export function Board({
  onQuit,
  quitNotes,
  result,
}: {
  onQuit?: () => void;
  quitNotes?: string[];
  /** 決着の結果の代わりに出すもの（チュートリアル。broke は帯が砕けて白転・暗転したあと） */
  result?: (o: { won: boolean; broke: boolean }) => React.ReactNode;
} = {}) {
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
    mulligan,
    start,
    quit: quitGame,
    mode,
    foeName,
    foeDeckRef,
    opening,
    resign,
    foeMove,
  } = useGame();
  const online = mode === "online";
  /** チュートリアルは案内どおり、手札を押したらすぐ場を選ぶ（シートを挟まない） */
  const direct = mode === "tutorial";
  // 盤面を出している間は、対戦の曲を流す（CPU 戦・オンライン対戦のどちらも。上の帯の左の音楽のボタンで止められる）
  usePageMusic("battle");
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
  /** 手札を下半分のシートで見ている位置（「出す」を押すと場を選ぶ手順に進む） */
  const [handOpen, setHandOpen] = useState<number | null>(null);
  /** 場のカードを下半分のシートで見ている */
  const [look, setLook] = useState<Peek | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 真ん中の文字欄：奥は相手の手、手前は自分の手の結果（少し見せて案内に戻す） */
  const [foeLine, setFoeLine] = useState<BoardLine | null>(null);
  const [myLine, setMyLine] = useState<BoardLine | null>(null);
  const lineSeen = useRef(-1);
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
  /** 相手のアイコン（アイコンの登録が入るまでは、相手のデッキのエースの絵） */
  const foeIcon = CATALOG[foeDeck?.ace ?? ""]?.art ?? DEFAULT_FOE_ICON;
  /** プレイヤーへの攻撃が当たった瞬間に先に見せたライフ（state が進むまでの間の表示）。同じ出来事の数字を二重に出さないためにも使う */
  const [lpHit, setLpHit] = useState<{ player: PlayerId; lp: number } | null>(null);
  const hitShown = useRef<{ player: PlayerId; lp: number } | null>(null);
  /** 出来事に合わせて出した演出（数字・バナーなど）が見え終わる時刻（performance.now()） */
  const fxUntil = useRef(0);
  /** 決着したあと、結果を出したか（最後の一撃を見せ終えてから出す）。"broke" は、アイコンが砕けて切り替わったあと（明けるのと同時に見せる） */
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

  // 相手の手（攻撃・カード・闇堕ち・時間切れ・決着）を見せ始めたら、開いている拡大・説明・確認・一覧を閉じて、盤面を見せる
  // （10月28日：裏向きのカードの説明を開いたまま、相手の闇堕ちと攻撃で決着し、相手の画面だけ止まった）
  // biome-ignore lint/correctness/useExhaustiveDependencies: foeMove が変わったときだけ閉じる
  useEffect(() => {
    setZoom(null);
    setOmenAsk(null);
    setTrashView(null);
    setLogOpen(false);
    setConfirmEnd(false);
    setBuzzAsk(null);
    setResignAsk(false);
    setQuitAsk(false);
    setHandOpen(null);
    setLook(null);
    setMenuOpen(false);
  }, [foeMove]);

  // 真ん中の文字欄に、いちばん新しい手を出す（奥は相手の手、手前は自分の手）
  useEffect(() => {
    const last = [...log].reverse().find((l) => BOARD_LINE_EVENTS.has(l.e.type));
    if (!last) {
      lineSeen.current = -1;
      setFoeLine(null);
      setMyLine(null);
      return;
    }
    if (last.id === lineSeen.current) return;
    lineSeen.current = last.id;
    const cardId = "cardId" in last.e ? last.e.cardId : undefined;
    const line = { text: describe(last.e), art: cardId ? CATALOG[cardId]?.art : undefined };
    if (useGame.getState().game?.active === CPU) return setFoeLine(line);
    setMyLine(line);
    const t = setTimeout(() => setMyLine(null), BOARD_LINE_MS);
    return () => clearTimeout(t);
  }, [log]);

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

  /** 手札の引き直しの間（両者が選び終えるまで） */
  const mulliganOpen = !!game?.mulligan && !game.winner;
  /** 始めの手札を配っている間（配り終えてから引き直しの窓を出す） */
  const [dealing, setDealing] = useState(false);
  /** 引き直しの戻す・引く演出を見せている間（store の演出が終わるまで。ターン開始の帯はそのあと） */
  const [swapping, setSwapping] = useState(false);
  useEffect(() => {
    if (!animating) setSwapping(false);
  }, [animating]);
  /** 引き直しを送ったオープニングの番号（送ったら窓を閉じる） */
  const [mullSent, setMullSent] = useState(-1);
  /** 引き直しで新しく引くまで隠しておく、自分の手札の位置 */
  const veil = useRef<number[]>([]);
  // 対戦の始め：オープニングのあと、山札から始めの手札を1枚ずつ配る（自分の手札は表に返る）。
  // 配り終えてから引き直しの窓を出す。配るあいだは、届いた相手の手も待たせる
  // biome-ignore lint/correctness/useExhaustiveDependencies: 引き直しが始まった（盤面が届いた）ときにも確かめる
  useLayoutEffect(() => {
    const g = useGame.getState().game;
    if (!g?.mulligan || dealtSeen >= opening || !g.mulligan.waiting.includes(ME) || !canShowDraw()) return;
    // オープニングの間は、配る前の手札を隠しておく（オープニングが消えていくときに透けて見えないように）
    if (openingOn) {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-hand="${ME}"] [data-hand-card]`))
        el.style.opacity = "0";
      return;
    }
    dealtSeen = opening;
    const mine = g.players[ME].hand.length;
    const foes = g.players[CPU].hand.length;
    holdOpening((Math.max(mine, foes) - 1) * DRAW_STEP_MS + DRAW_MS + 90);
    setDealing(true);
    const draws: Promise<void>[] = [];
    for (let i = 0; i < mine; i++) draws.push(animateDraw(ME, i * DRAW_STEP_MS, i));
    for (let i = 0; i < foes; i++) draws.push(animateDraw(CPU, i * DRAW_STEP_MS + 90));
    void Promise.all(draws).then(() => setDealing(false));
  }, [openingOn, opening, mulliganOpen]);
  // 引き直しで新しい手札を出したとき、引いてくるまでその位置を隠す（描画の直後・見える前に）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 盤面を描き直すたびに確かめる
  useLayoutEffect(() => {
    if (veil.current.length === 0) return;
    const cards = document.querySelectorAll<HTMLElement>(`[data-hand="${ME}"] [data-hand-card]`);
    for (const i of veil.current) if (cards[i]) cards[i].style.opacity = "0";
  }, [game]);
  // オンライン対戦の引き直しの締め切り（サーバーの時計から。CPU 戦は null で、窓を開いてから 30 秒）
  const liveClock = useLive((s) => s.clock);
  const liveAt = useLive((s) => s.at);
  const mulliganDeadline =
    online && liveClock?.mulliganLeft != null ? liveAt + liveClock.holdMs + liveClock.mulliganLeft : null;

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
            playSe("spell");
            setTimeout(() => setReveal((r) => (r?.id === id ? null : r)), 1000);
            await wait(visible ? 620 : 900);
          }
          const f = frameRect();
          const from = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
          await presentPhased(shown, events, next, { from, tint, spell: true }, show);
        } else if (a.type === "attack") {
          // 攻撃で倒れて【破壊されたとき】が働く・キャラクターが出るとき（攻撃の演出は beforeAttack で見せ終えている）。
          // 抜け殻から魂が抜け出て効果の先へ飛び、出すキャラクターは抜け殻が消えてから置く
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
          // 【闇堕ちしたとき】の自分への強化は、まだ足さずに置く（「+N」を見せてから数字を上げる）
          let cur = shown;
          for (const [k, e] of events.entries()) {
            if (e.type !== "darkFall" || !KUSAHAMI_AMBUSH.has(e.cardId) || !fxEnabled()) continue;
            const last = next.players[e.player].field[e.slot];
            if (!last || last.cardId !== e.cardId) continue;
            const unit = beforeBuffs(last, e.player, e.slot, events, k + 1);
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
            // 毒の茨の演出の頭から、闇堕ちの曲を流す
            playMusicOnce("dark");
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
      mulligan: async ({ player, count, indexes }, show) => {
        // 戻すカードを1枚ずつ山札へ飛ばし、引き直したあとの手札を出して、同じ枚数を山札から引く
        setSwapping(true);
        const picks: (number | null)[] = indexes ?? Array.from({ length: count }, () => null);
        try {
          await Promise.all(picks.map((i, k) => animateReturn(player, i, k * DRAW_STEP_MS)));
          if (player === ME) veil.current = picks.filter((i): i is number => i !== null);
          show();
          await nextFrame();
          await Promise.all(picks.map((i, k) => animateDraw(player, k * DRAW_STEP_MS, i ?? undefined)));
        } finally {
          // 途中で止まっても、隠した手札は必ず見せる
          veil.current = [];
          if (player === ME)
            for (const el of document.querySelectorAll<HTMLElement>(`[data-hand="${ME}"] [data-hand-card]`))
              el.style.opacity = "";
        }
      },
      revealFoe: (g, cardId, a) =>
        new Promise<void>((resolve) => {
          setReveal({ id: Date.now(), cardId, kind: a.type });
          if (a.type === "cast") playSe("spell");
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
    // オープニング・始めの手札を配る・手札の引き直しの間は、ターン開始のバナーなどを出さずに待つ（終わったら続きから出す）
    if (openingOn || mulliganOpen || dealing || swapping) return;
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
        // 対戦の最初と、つなぎ直したときの帯（出来事の 1 番目）は、入れ替わりではないので鳴らさない
        if (id > 1) playSe("turnChange");
        t += 950;
        hold(t);
      } else if (e.type === "darkOmen") {
        playSe("darkOmen");
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
      } else if (e.type === "buffed" && !fx && buzzUid !== undefined) {
        // 便乗：バズしたキャラクターの数字が変わったあとに、便乗のキャラクターへ1体ずつ光を飛ばして数字を上げる
        const uid = uidAt(e.player, e.slot);
        if (uid) {
          const at = t + 320 + riders++ * 240;
          showRiding(buzzUid, uid, e, at);
          hold(at + 900);
        }
      } else if (e.type === "darkFall" || e.type === "restored") {
        // 闇堕ちの曲は、どのカードでも、裏返しの演出があってもなくても流す（流している間は流し直さない）
        if (e.type === "darkFall") setTimeout(() => playMusicOnce("dark"), t + 80);
        const uid = uidAt(e.player, e.slot);
        // 毒の茨の演出で出した闇の姿は、もう場に出ているので裏返さない
        if (uid && withered.current.delete(uid)) continue;
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
        hold(t + 980);
      }
    }
    if (until > 0) fxUntil.current = Math.max(fxUntil.current, performance.now() + until);
  }, [log, openingOn, mulliganOpen, dealing, swapping]);

  // 決着：最後の一撃（ダメージの数字・ライフが 0 になるところ）やターン開始のバナーを見せ終えてから、
  // 負けた側のプレイヤーの帯が砕け、破片がこちらへ飛んできてぶつかり、暗転（負け）・白転（勝ち）して、明けたら結果（fx/lifeBreak.ts）。
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
        image: loser === ME ? MY_ICON : foeIcon,
        // 破片は負けた側のアイコンの絵のかけら。ふちの色味は、負けた側のライフの色。負けは破片が黒く、まわりが暗く沈む。勝ちは破片がキラッと光る。
        // ぶつかったあとは、勝ちは白転・負けは暗転（lifeBreak の中で決まる）
        tint: loser === ME ? "#8fdcfb" : "#ffb0b8",
        mine: loser === ME,
        onCovered: () => {
          if (live) setResultOpen("broke");
        },
      });
    })();
    return () => {
      live = false;
      fx?.cancel();
    };
  }, [winner, foeIcon]);

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
  const myTurn =
    game.active === ME && !game.winner && !cpuBusy && !animating && !game.pending && !game.mulligan;
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
          className={`unit foe-unit enter ${hit || castable ? "targetable" : ""} ${pv ? "has-pv" : ""} ${drag?.over === `foe:${slot}` && (hit || castable) ? "drop-over" : ""}`}
          onClick={() => {
            if (justDragged()) return;
            if (castable) return cast({ side: "enemy", slot });
            if (hit) return attack({ kind: "unit", slot });
            setPeek(p);
            setLook(p);
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
          else setLook(p);
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      >
        {/* 攻撃できることは金の枠で見せる。札は、ふつうの攻撃と違うときだけ */}
        {ready && (u.attacksLeft > 1 || u.rushOnly) && (
          <em className="mini-ready">{u.attacksLeft > 1 ? "2回攻撃可" : "突進"}</em>
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
        onPress={!usable ? undefined : (e) => begin(e, { kind: "hand", index: i })}
        onClick={() => {
          if (justDragged()) return;
          setPeek(p);
          // ふだんは下半分のシートで見る。チュートリアルは案内どおり、押して場を選ぶ
          if (!direct) {
            select(null);
            setHandOpen(i);
            return;
          }
          if (!myTurn) return;
          if (selected && card.type === "post" && !card.target) return cast();
          select(selected ? null : { kind: "hand", index: i });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      />
    );
  };

  // 舞台の部品
  const lifeOf = (p: PlayerId) => (lpHit?.player === p ? lpHit.lp : game.players[p].lp);
  const foeFace = (
    <PlayerFace
      side="foe"
      name={foeName}
      icon={foeIcon}
      lp={lifeOf(CPU)}
      active={game.active === CPU}
      cut={damageCutOn(game, CPU)}
      locked={attacking && foeGuarded && !canHit({ kind: "leader" })}
      targetable={attacking && canHit({ kind: "leader" })}
      dropOver={drag?.over === "leader" && attacking && canHit({ kind: "leader" })}
      preview={preview({ kind: "leader" })}
      onClick={() => !justDragged() && attack({ kind: "leader" })}
    />
  );
  const meFace = (
    <PlayerFace
      side="me"
      name="あなた"
      icon={MY_ICON}
      lp={lifeOf(ME)}
      active={game.active === ME}
      cut={damageCutOn(game, ME)}
    >
      <CostGems mana={me.mana} max={me.maxMana} />
    </PlayerFace>
  );
  /** プレイヤーに付いている状態（無敵・ダメージ軽減・ターンの終わりのダメージ） */
  const statusChips = (p: PlayerId) => {
    const cut = damageCutOn(game, p);
    const delayed = delayedDamageOn(game, p);
    return (
      <>
        {isShielded(game, p) && <span className="pchip st-shield">無敵</span>}
        {cut > 0 && <span className="pchip st-cut">ダメージ-{cut}</span>}
        {delayed > 0 && <span className="pchip st-delayed">ターンの終わりに {delayed} ダメージ</span>}
      </>
    );
  };
  const turnOn = !game.winner;
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
            <OmenMark awake={darkOmenAwake(game, CPU, omenAt(CPU, slot) as DarkOmen)} />
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
              <OmenMark awake={darkOmenAwake(game, ME, omen)} />
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
    <div className={`hand ${me.hand.length > 5 ? "many" : ""}`} data-hand={ME} data-drop="hand">
      {me.hand.map((id, i) => handCard(id, i))}
    </div>
  );
  const buzzLeft = me.buzzLeft ?? 0;
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
      aria-label={`バズ（残り${buzzLeft}回）${buzzWhy ? `：${buzzWhy}` : ""}`}
    >
      {buzzOpen && buzzWake > 0 && <span key={buzzWake} className="buzz-ring" aria-hidden="true" />}
      バズ
      <small>のこり {buzzLeft} 回</small>
    </button>
  );
  /** このターンにまだできることがあるか（場と手札。game-core の turnOptions） */
  const hasTurnOptions = (o: TurnOptions) => o.attackers + o.playable + o.darkFall > 0 || o.buzz;
  const endTurnBtn = (
    <button
      type="button"
      className={`btn end-turn ${myTurn ? "now" : ""}`}
      onClick={() => {
        // 場と手札でまだできること（攻撃・出す・バズ・闇堕ち）が無ければ、確かめずにターンを終える
        if (hasTurnOptions(turnOptions(game, ME, CATALOG))) {
          select(null);
          setConfirmEnd(true);
        } else endTurn();
      }}
      disabled={!myTurn}
    >
      {game.active === ME ? "ターン終了" : "相手のターン"}
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
  /** シートの「出す」「使う」のボタンの文と、押せるか */
  const handAction = (i: number) => {
    const id = me.hand[i];
    const card = id ? CATALOG[id] : undefined;
    if (!id || !card) return { label: "", ok: false };
    const verb = card.type === "icon" ? "出す" : "使う";
    if (game.active !== ME) return { label: "相手のターンです", ok: false };
    if (effectiveCost(game, ME, id, CATALOG) > me.mana) return { label: "コストが足りません", ok: false };
    if (card.type === "icon" && freeSlot < 0) return { label: "場に空きがありません", ok: false };
    if (card.type === "post" && card.target && castTargets(game, ME, id, CATALOG).length === 0)
      return { label: "使える相手がいません", ok: false };
    return { label: verb, ok: myTurn };
  };
  /** 手札の枚数が減っても、シートは残っているカードを指す */
  const sheetIndex = handOpen === null ? null : Math.min(handOpen, me.hand.length - 1);
  const closeMenu = (after: () => void) => {
    setMenuOpen(false);
    after();
  };
  const lookCard = look ? CATALOG[look.id] : undefined;
  const options = turnOptions(game, ME, CATALOG);
  const dealt = !mulliganOpen && !openingOn && !dealing;
  // 奥の文字欄：相手の手と状態
  const foeText: BoardLine | null = sacGuide?.source
    ? { text: `${sacGuide.source}の効果` }
    : mulliganOpen && game.mulligan?.waiting.includes(CPU)
      ? { text: "相手が手札を選んでいます" }
      : !dealt
        ? { text: game.active === CPU ? "相手が先攻です" : "相手は後攻です" }
        : (foeLine ?? { text: "相手の手がここに出ます" });
  // 手前の文字欄：次に何をするか。指示のときは光らせる
  const askText = sacGuide
    ? sacGuide.mine
      ? "破壊する自分のキャラクターを1体選んでください"
      : "相手が破壊するキャラクターを選んでいます"
    : mulliganOpen && game.mulligan?.waiting.includes(ME)
      ? "戻すカードを選んでください"
      : attacking
        ? foeGuarded && !canHit({ kind: "leader" })
          ? "ガードのキャラクターを攻撃してください"
          : "攻撃する相手を選んでください"
        : buzzAsk !== null
          ? "このキャラクターにバズしますか"
          : buzzing
            ? "バズするキャラクターを選んでください"
            : selection?.kind === "hand" && selectedCard
              ? selectedCard.type === "icon"
                ? "出す場所を選んでください"
                : selectedCard.target
                  ? "対象を選んでください"
                  : "このカードを使いますか"
              : confirmEnd
                ? "ターンを終えますか"
                : omenAsk && fallSlots.includes(omenAsk.slot)
                  ? "闇堕ちさせますか"
                  : null;
  const hint = !dealt
    ? game.active === ME
      ? "あなたが先攻です"
      : "あなたは後攻です 手札 +1 枚"
    : game.active !== ME
      ? "相手のターンです"
      : options.attackers + options.playable === 0
        ? "ターンを終えられます"
        : `攻撃できる ${options.attackers} 体・出せるカード ${options.playable} 枚`;
  const myText: BoardLine = error
    ? { text: error }
    : askText
      ? { text: askText }
      : (myLine ?? { text: hint });
  const field = fieldOf(game, CATALOG);
  const boardClass = `board turn-${game.active === ME ? "me" : "foe"}${field ? ` field-${field.kind}` : ""}${director !== null ? " field-director" : ""}${arbiter ? " field-arbiter" : ""}${fixer ? " field-fixer" : ""}${god ? " field-god" : ""}${sacGuide ? " sac-mode" : ""}`;
  const fieldLayer = field ? <FieldLayer kind={field.kind} mine={field.owner === ME} /> : null;

  // 相手が出したカードは、相手の陣地の上に重ねて見せる
  const revealEl = reveal && CATALOG[reveal.cardId] && (
    <div key={reveal.id} className={`foe-reveal ${reveal.mine ? "mine" : ""}`} aria-live="polite">
      <div className="fr-card">
        <HoloCard card={CATALOG[reveal.cardId] as CardDef} idle={false} />
      </div>
    </div>
  );
  const bannerEl = banner && (
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
  );

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
            "--card-h": `${stage.card}px`,
          } as CSSProperties
        }
      >
        {/* 縦の舞台：奥が相手、手前が自分。真ん中の VS の線で陣地を分ける */}
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
          {drag && throwHint && <div className={`post-zone ${throwOver ? "over" : ""}`} aria-hidden="true" />}
          <div className="pfoe">
            <div className="ptop">
              <button type="button" className="pmenu" aria-label="メニュー" onClick={() => setMenuOpen(true)}>
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div className="pchips">
                <span className="pchip" data-hand={CPU}>
                  手札 {foe.hand.length}
                </span>
                <span className="pchip" title={`バズ 残り${foe.buzzLeft ?? 0}回`}>
                  バズ
                  {[0, 1].map((k) => (
                    <i key={k} className={`pip ${k < (foe.buzzLeft ?? 0) ? "on" : ""}`} />
                  ))}
                </span>
                {online && <span className="pchip pname">{foeName}</span>}
              </div>
              {foeFace}
              <div className="pchips right">
                <span className="pchip">
                  コスト {foe.mana}/{foe.maxMana}
                </span>
                <Piles
                  owner={CPU}
                  deck={foe.deck.length}
                  trash={foe.trash}
                  onTrash={() => setTrashView(CPU)}
                />
                {online && foeClock && !game.winner && <ClockChip left={foeClock} />}
              </div>
              <div className="pstates">{statusChips(CPU)}</div>
            </div>
            {foeRow}
            <BoardText line={foeText} className={`foe ${game.active === CPU && dealt ? "ask" : ""}`} />
            {revealEl}
          </div>
          <div className="pmid">
            {turnOn && (
              <>
                <span className="pturn">TURN {game.turn}</span>
                <span className="pvs">VS</span>
                <span className={`pturn side ${game.active === ME ? "mine" : "foe"}`}>
                  {game.active === ME ? "あなたのターン" : "相手のターン"}
                </span>
              </>
            )}
            {bannerEl}
          </div>
          <div className="pself">
            <BoardText line={myText} className={`me ${error ? "err" : askText ? "ask" : ""}`} />
            <div className="plow">
              {meRow}
              <div className="pme">
                <div className="pme-left">
                  <p className="pcost">
                    <span>コスト</span>
                    <b key={me.mana}>{me.mana}</b>
                    <small>/{me.maxMana}</small>
                  </p>
                  {buzzBtn}
                </div>
                {meFace}
                <div className="pme-right">
                  <button
                    type="button"
                    className="btn ghost phand-open"
                    disabled={me.hand.length === 0}
                    onClick={() => {
                      select(null);
                      setHandOpen(0);
                    }}
                  >
                    手札を見る
                  </button>
                  {endTurnBtn}
                </div>
                <div className="pme-foot">
                  <span className="pchips row-chips">
                    {online && myClock && !game.winner && <ClockChip left={myClock} mine />}
                    {statusChips(ME)}
                    {me.hand.length > 5 && <span className="pchip">手札 {me.hand.length}</span>}
                  </span>
                  <Piles owner={ME} deck={me.deck.length} trash={me.trash} onTrash={() => setTrashView(ME)} />
                </div>
              </div>
              <div className="phand-zone">
                <div className="phand">{handEl}</div>
              </div>

              {selection?.kind === "hand" && selectedCard && !direct && !drag && (
                <AskBar
                  art={selectedCard.art}
                  title={selectedCard.name}
                  onBack={() => {
                    const i = selection.index;
                    select(null);
                    setHandOpen(i);
                  }}
                  go={
                    postSelected && !selectedCard.target
                      ? { label: "使う", onClick: () => cast() }
                      : undefined
                  }
                />
              )}
              {buzzing && buzzAsk === null && (
                <AskBar title={`バズ のこり ${buzzLeft} 回`} onBack={() => select(null)} />
              )}
              {buzzAsk !== null && buzzAskUnit && canBuzz && (
                <AskBar
                  art={(CATALOG[buzzAskUnit.cardId] as CardDef).art}
                  title={(CATALOG[buzzAskUnit.cardId] as CardDef).name}
                  note={buzzNote(viewUnit(game, ME, buzzAskUnit, CATALOG))}
                  onBack={() => setBuzzAsk(null)}
                  go={{
                    label: "バズする",
                    onClick: () => {
                      setBuzzAsk(null);
                      buzz(buzzAsk);
                    },
                  }}
                />
              )}
              {confirmEnd && myTurn && (
                <AskBar
                  title="まだできることがあります"
                  note={endNote(options)}
                  onBack={() => setConfirmEnd(false)}
                  go={{
                    label: "ターン終了",
                    onClick: () => {
                      setConfirmEnd(false);
                      endTurn();
                    },
                  }}
                />
              )}

              {sheetIndex !== null && sheetIndex >= 0 && (
                <HandSheet
                  cards={me.hand}
                  index={sheetIndex}
                  action={handAction(sheetIndex)}
                  onIndex={setHandOpen}
                  onZoom={(i) => setZoom({ id: me.hand[i] as string, where: "hand", index: i })}
                  onClose={() => setHandOpen(null)}
                  onGo={() => {
                    setHandOpen(null);
                    select({ kind: "hand", index: sheetIndex });
                  }}
                />
              )}
              {look && lookCard && (
                <LookSheet
                  card={lookCard}
                  view={look.view}
                  onZoom={() => setZoom(look)}
                  onClose={() => setLook(null)}
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
              {mulliganOpen &&
                !openingOn &&
                !dealing &&
                !animating &&
                mullSent !== opening &&
                game.mulligan?.waiting.includes(ME) && (
                  <MulliganSheet
                    key={opening}
                    hand={me.hand}
                    deadline={mulliganDeadline}
                    onDone={(indexes) => {
                      setMullSent(opening);
                      mulligan(indexes);
                    }}
                  />
                )}
              {menuOpen && (
                <section className="psheet pmenu-sheet" role="dialog" aria-label="メニュー">
                  <button type="button" className="pm-row" onClick={() => closeMenu(() => setLogOpen(true))}>
                    対戦の記録
                  </button>
                  <SoundMenu className="pm-row" label="音の大きさ" />
                  <button type="button" className="pm-row" onClick={() => closeMenu(() => setTrashView(ME))}>
                    自分の墓地を見る
                  </button>
                  <button type="button" className="pm-row" onClick={() => closeMenu(() => setTrashView(CPU))}>
                    相手の墓地を見る
                  </button>
                  {online && !game.winner && (
                    <button
                      type="button"
                      className={`pm-row ${resignAsk ? "ask" : ""}`}
                      onClick={() => (resignAsk ? resign() : setResignAsk(true))}
                      onBlur={() => setResignAsk(false)}
                    >
                      {resignAsk ? "本当に降参する" : "降参する"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="pm-row"
                    data-tap-se
                    onClick={() => closeMenu(() => (game.winner ? quit() : setQuitAsk(true)))}
                  >
                    {online ? "ロビーへ戻る" : "対戦をやめる"}
                  </button>
                  <div className="ps-foot">
                    <button type="button" className="btn lg" onClick={() => setMenuOpen(false)}>
                      閉じる
                    </button>
                  </div>
                </section>
              )}
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

      {game.winner && resultOpen && result?.({ won: game.winner === ME, broke: resultOpen === "broke" })}
      {game.winner && resultOpen && !result && (
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

/** 真ん中の文字欄の 1 行 */
function BoardText({ line, className }: { line: BoardLine | null; className: string }) {
  return (
    <p className={`pmsg ${className}`} role="status">
      {line?.art && <i style={{ backgroundImage: `url(${line.art})` }} />}
      <span>{line?.text}</span>
    </p>
  );
}

/** 手札の場所に重ねて出す確認の帯。押して決めるまで進まず、「戻る」で引き返せる */
function AskBar({
  art,
  title,
  note,
  onBack,
  go,
}: {
  art?: string;
  title: string;
  note?: string;
  onBack: () => void;
  go?: { label: string; onClick: () => void };
}) {
  return (
    <section className="pask" role="dialog" aria-label={title}>
      {art && <span className="pask-art" style={{ backgroundImage: `url(${art})` }} />}
      <div className="pask-body">
        <b>{title}</b>
        {note && <span>{note}</span>}
        <div className="pask-acts">
          <button type="button" className="btn ghost hand-cancel" onClick={onBack}>
            戻る
          </button>
          {go && (
            <button type="button" className="btn" data-decide-se onClick={go.onClick}>
              {go.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** 手札を下半分で見るシート。左右のスワイプでカードをめくり、「出す」「使う」で場を選ぶ手順へ進む */
function HandSheet({
  cards,
  index,
  action,
  onIndex,
  onZoom,
  onClose,
  onGo,
}: {
  cards: string[];
  index: number;
  action: { label: string; ok: boolean };
  onIndex: (i: number) => void;
  onZoom: (i: number) => void;
  onClose: () => void;
  onGo: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const last = cards.length - 1;
  const pull = (index === 0 && dx > 0) || (index === last && dx < 0) ? dx * 0.3 : dx;
  const up = (x: number) => {
    if (start.current === null) return;
    const d = x - start.current;
    start.current = null;
    setDx(0);
    if (!moved.current || Math.abs(d) < SWIPE_PX) return;
    onIndex(Math.max(0, Math.min(last, index + (d < 0 ? 1 : -1))));
  };
  return (
    <section className="psheet hand-sheet" role="dialog" aria-label="手札">
      <div
        className="hs-reel"
        onPointerDown={(e) => {
          start.current = e.clientX;
          moved.current = false;
        }}
        onPointerMove={(e) => {
          if (start.current === null) return;
          const d = e.clientX - start.current;
          if (Math.abs(d) < 8 && !moved.current) return;
          moved.current = true;
          setDx(d);
        }}
        onPointerUp={(e) => up(e.clientX)}
        onPointerCancel={(e) => up(e.clientX)}
        onPointerLeave={(e) => up(e.clientX)}
      >
        {cards.map((id, i) => {
          const card = CATALOG[id];
          // 重い絵を増やさないよう、見ているカードと両隣だけ置く
          if (!card || Math.abs(i - index) > 1) return null;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが並ぶので手札の位置で見分ける
              key={i}
              type="button"
              className={`hs-card ${i === index ? "" : "far"}`}
              aria-label={card.name}
              style={{
                transform: `translateX(calc(-50% + ${(i - index) * 108}% + ${pull}px))`,
                transition: dx ? "none" : undefined,
              }}
              onClick={() => {
                if (moved.current) return;
                if (i === index) onZoom(i);
                else onIndex(i);
              }}
            >
              <HoloCard card={card} idle={false} />
            </button>
          );
        })}
      </div>
      <div className="hs-dots" aria-hidden="true">
        {cards.map((id, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 手札の位置そのものを点で見せる
          <i key={`${id}-${i}`} className={i === index ? "on" : ""} />
        ))}
      </div>
      <div className="ps-foot">
        <button type="button" className="btn ghost ps-back" onClick={onClose}>
          閉じる
        </button>
        <button type="button" className="btn lg" data-decide-se disabled={!action.ok} onClick={onGo}>
          {action.label}
        </button>
      </div>
    </section>
  );
}

/** 場のカードを下半分で見るシート。カードを押すと画面いっぱいに拡大する */
function LookSheet({
  card,
  view,
  onZoom,
  onClose,
}: {
  card: CardDef;
  view?: UnitView;
  onZoom: () => void;
  onClose: () => void;
}) {
  return (
    <section className="psheet look-sheet" role="dialog" aria-label={card.name}>
      <div className="hs-reel">
        <button
          type="button"
          className="hs-card"
          aria-label={`${view?.name ?? card.name}を拡大`}
          onClick={onZoom}
        >
          <HoloCard card={card} darkForm={view?.unit.dark} idle={false} />
        </button>
      </div>
      <div className="ps-foot">
        <button type="button" className="btn lg" onClick={onClose}>
          閉じる
        </button>
      </div>
    </section>
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
          <button type="button" className="btn lg" data-decide-se onClick={onAgain}>
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

/** 山札と墓地の枚数。墓地を押すと一覧を出す（山札・墓地の場所はカードが飛ぶ演出の目印にもなる） */
function Piles({
  owner,
  deck,
  trash,
  onTrash,
}: {
  owner: PlayerId;
  deck: number;
  trash: string[];
  onTrash: () => void;
}) {
  return (
    <span className="pchip ppiles">
      <span data-pile={`deck-${owner}`}>山札 {deck}</span>・
      <button type="button" data-pile={`trash-${owner}`} onClick={onTrash}>
        墓地 {trash.length}
      </button>
    </span>
  );
}

/** 真ん中の文字欄の 1 行（文と、添えるカードの絵） */
interface BoardLine {
  text: string;
  art?: string;
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

/**
 * プレイヤーの顔。攻撃する相手はこのアイコンで、まわりの輪がライフの残り。
 * 決着のときは、このアイコン（data-master）が砕ける
 */
function PlayerFace({
  side,
  name,
  icon,
  lp,
  active,
  cut = 0,
  locked,
  targetable,
  dropOver,
  preview,
  onClick,
  children,
}: {
  side: "me" | "foe";
  name: string;
  icon: string;
  lp: number;
  active?: boolean;
  /** ダメージを減らす効果の量（膜を出す） */
  cut?: number;
  /** ガードに守られて攻撃できない */
  locked?: boolean;
  targetable?: boolean;
  dropOver?: boolean;
  preview?: AttackPreview | null;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const ring = { "--life": `${Math.max(0, Math.min(100, (lp / 20) * 100))}%` } as CSSProperties;
  const body = (
    <>
      <span className="pf-photo">
        <img src={icon} alt="" draggable={false} />
      </span>
      {cut > 0 && <i className="pb-film" aria-hidden="true" />}
    </>
  );
  return (
    <div className={`pface ${side} ${active ? "active" : ""} ${locked ? "locked" : ""}`}>
      {children}
      {onClick ? (
        <button
          type="button"
          data-master={side === "me" ? ME : CPU}
          data-drop="leader"
          className={`pf-ring ${targetable ? "targetable" : ""} ${dropOver ? "drop-over" : ""}`}
          style={ring}
          disabled={!targetable}
          onClick={onClick}
          aria-label={`${name}のプレイヤーを攻撃`}
        >
          {body}
        </button>
      ) : (
        <div className="pf-ring" data-master={side === "me" ? ME : CPU} style={ring}>
          {body}
        </div>
      )}
      <span className="pf-life">
        ライフ <b key={lp}>{lp}</b>
      </span>
      {preview && <AttackBadge pv={preview} leader />}
      {locked && <span className="atk-pv leader lock">ガードで守られています</span>}
    </div>
  );
}

/** 自分の顔のまわりのコスト。上から時計回りに 10 個並べ、使える分が光る。増えた 1 個は key が変わって飛び出す */
function CostGems({ mana, max }: { mana: number; max: number }) {
  return (
    <span className="pgems" aria-label={`コスト ${mana} / ${max}`} role="img">
      {COST_SLOTS.map((i) => (
        <i
          key={i === max - 1 ? `new-${max}` : i}
          className={`${i < mana ? "on" : i < max ? "left" : ""} ${i === max - 1 ? "fresh" : ""}`}
          style={{ "--a": `${i * 36}deg` } as CSSProperties}
        />
      ))}
    </span>
  );
}
