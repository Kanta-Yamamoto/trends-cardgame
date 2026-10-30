import { CARDS, type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  type Action,
  type AttackTarget,
  applyAction,
  autoSacrifice,
  type CastTarget,
  createGame,
  createTutorialGame,
  type GameEvent,
  type GameState,
  type PlayerId,
  planTurnSearch,
  RuleError,
} from "@trends/game-core";
import { create } from "zustand";
import { beforeBuffs } from "./beforeBuffs";
import { abandonCpuLog, beginCpuLog, logMove, logThought, watchPageHide } from "./cpuLog";
import type { DeckSel } from "./decks";

export const CATALOG: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** 構築済みデッキの名前・説明と、デッキ選択のサムネに出すエース（★5） */
export const DECK_INFO: Record<DeckId, { name: string; text: string; ace?: string }> = {
  solo_flame: {
    ace: "c2",
    name: "炎アグロ",
    text: "「レン」の連撃と闇堕ちで、相手が守る前に押し切ろう",
  },
  solo_idol: {
    ace: "m1",
    name: "推しミッドレンジ",
    text: "「トップアイドル」が闇堕ちすると、親衛隊を連れて戻ってくる。育てた盤面で押し切ろう",
  },
  solo_expert: {
    ace: "g4",
    name: "神コントロール",
    text: "「専門家」の闇堕ちで、山札を引き切っての勝利を目指そう",
  },
  solo_meme: {
    ace: "k5",
    name: "自然・全体強化",
    text: "草で場を埋め、全体を強化して押し切ろう。「伝説のコラ画像」は出すたびに大きくなる",
  },
  solo_heal: {
    ace: "c5",
    name: "水コントロール",
    text: "「ナギ」で相手を眠り状態にし、回復しながら守り切ろう",
  },
  fixer_meme: {
    ace: "c14",
    name: "自然・クサハミ",
    text: "草が破壊されるほど「クサハミ」が育つ。育てて一撃で押し切ろう",
  },
  unei_idol: {
    ace: "c17",
    name: "運営ミッドレンジ",
    text: "「演出家」で両者のエースを舞台に上げ、「調停者」と「フィクサー」で場を裁こう",
  },
};

/** チュートリアルの対戦で使うデッキの名前（盤面は createTutorialGame が作るので、カードの並びは使わない） */
const TUTORIAL_DECK: DeckSel = {
  ref: "tutorial",
  name: "チュートリアル",
  text: "",
  cards: [],
  attrs: ["炎"],
};

export const ME: PlayerId = "p1";
export const CPU: PlayerId = "p2";

type Selection =
  | { kind: "hand"; index: number }
  | { kind: "attacker"; slot: number }
  /** バズさせる自分のキャラクターを選んでいる */
  | { kind: "buzz" }
  | null;

export interface LogEntry {
  id: number;
  e: GameEvent;
  /** 効果の演出（resolveEffects）で見せ終わった出来事なら true（数字を二重に出さない） */
  fx?: boolean;
}

/** オンライン対戦で、サーバーから届く1手分 */
export interface RemoteUpdate {
  action: Action;
  events: GameEvent[];
  state: GameState;
}

/** オンライン対戦のつなぎ口（送った操作が反則ならエラー文を返す） */
export interface RemoteLink {
  send: (a: Action) => Promise<string | null>;
  resign: () => void;
  /**
   * 自分のターンが始まった手を見せ終えた（turn は通算ターン）。サーバーはここから自分の時計を動かす
   * （相手の手の演出を見ている間に、持ち時間が減らないように）
   */
  ready?: (turn: number) => void;
}

interface GameStore {
  /**
   * cpu＝CPU と対戦／online＝ほかの人と対戦（状態はサーバーから届く）／
   * tutorial＝チュートリアルの 1 ターンだけの対戦（CPU は動かず、記録も送らない。tutorial/Tutorial.tsx）
   */
  mode: "cpu" | "online" | "tutorial";
  /** 相手の名前 */
  foeName: string;
  /** 自分が選んだデッキ（構築済みか、自分で組んだもの）。null ならデッキ選択画面 */
  deck: DeckSel | null;
  /** 相手のデッキ（構築済みデッキの ID か "custom:…"）。オープニングで見せる */
  foeDeckRef: string | null;
  /** 新しい対戦が始まるたびに増える。画面はこれが変わったらオープニングを見せる */
  opening: number;
  game: GameState | null;
  log: LogEntry[];
  error: string | null;
  selection: Selection;
  /** CPU が動いている間は true（操作を受け付けない） */
  cpuBusy: boolean;
  /** CPU の1手ごとの間隔（ms）。0 なら一気に進める（テスト用） */
  cpuDelay: number;
  /** 自分の攻撃の演出中は true（操作を受け付けない） */
  animating: boolean;
  /**
   * 相手の手（相手の操作・時間切れ・決着）を見せ始めるたびに増える。
   * 画面はこれが変わったら、開いている拡大・確認・一覧を閉じて、相手の手を見せる
   */
  foeMove: number;
  start: (deck: DeckSel, opts?: { seed?: number; first?: PlayerId }) => void;
  /** チュートリアルの対戦を始める（いつも同じ盤面。game-core の createTutorialGame） */
  startTutorial: () => void;
  quit: () => void;
  select: (s: Selection) => void;
  play: (slot: number) => void;
  /** 選んでいる手札の呪文を使う（対象が要るものは target を渡す） */
  cast: (target?: CastTarget) => void;
  attack: (target: AttackTarget) => void;
  endTurn: () => void;
  /** バズ：選んだ自分のキャラクターに +2/+2 と突進（カットインを見せてから） */
  buzz: (slot: number) => void;
  /** 差し出し（フィクサー）：自分のキャラクターを1体選ぶ */
  sacrifice: (slot: number) => void;
  /** 闇堕ち：自分の裏向きのカードを、その枠に闇堕ちの姿で出す（闇堕ちの演出を見せてから） */
  darkFall: (slot: number) => void;
  /** オンライン対戦を始める（再接続のときも、届いた状態で呼び直す） */
  startOnline: (o: {
    deck: DeckSel;
    foeName: string;
    foeDeckRef?: string;
    state: GameState;
    link: RemoteLink;
  }) => void;
  /** サーバーから届いた1手を反映する（攻撃なら演出のあとで） */
  receive: (u: RemoteUpdate) => void;
  resign: () => void;
}

/** start / quit のたびに増やし、古い CPU の処理を止める */
let runId = 0;

/**
 * 画面側の演出。攻撃の前に呼ばれ、演出が終わってから state を更新する。
 * テストや演出なしの環境では登録しない（そのまま即時に進む）。
 */
export interface Presenter {
  beforeAttack: (game: GameState, action: Extract<Action, { type: "attack" }>) => Promise<void>;
  /** CPU のターンが始まってから最初の操作までの待ち（ターン開始の演出のため） */
  turnIntro: number;
  /**
   * 出す・呪文・ターン終了の効果を見せる（state を進める前）。
   * shown は今画面に出ている state（出したキャラクターは場に置いた姿）、next は効果がすべて済んだ state。
   * show で、途中の state を画面に出せる（効果で出たキャラクターを、合図のあとに1体ずつ置くため）
   */
  resolveEffects?: (
    shown: GameState,
    action: Action,
    events: GameEvent[],
    next: GameState,
    show: (g: GameState) => void,
  ) => Promise<void>;
  /** 相手がカードを出す・呪文を使う前に、そのカードを大きく見せる */
  revealFoe?: (
    game: GameState,
    cardId: string,
    action: Extract<Action, { type: "play" | "cast" }>,
  ) => Promise<void>;
  /** 闇堕ちの演出（画面全体）。自分・相手どちらの闇堕ちでも、state を進める前に見せる */
  darkFall?: (cardId: string, player: PlayerId) => Promise<void>;
  /** バズのカットイン（プレイヤーとバズ）。state を進める前に見せる */
  buzz?: (game: GameState, action: Extract<Action, { type: "buzz" }>) => Promise<void>;
}
let presenter: Presenter | null = null;
export const setPresenter = (p: Presenter | null) => {
  presenter = p;
};

let link: RemoteLink | null = null;
/** サーバーから届いた手を、順番に1つずつ反映する */
let inbox: RemoteUpdate[] = [];
/**
 * 演出1つを待つ上限（ms。オンライン対戦の届いた手も、CPU 対戦の手も）。演出が止まったり（途中で消えた・画面が裏に回った）
 * 失敗したりしても、盤面は必ず進める（10月28日：相手の画面だけ、決着の手が出ないまま止まった。
 * 10月30日：CPU 対戦で、選んだ手札が持ち上がったまま、ターン終了とバズが押せなくなった）
 */
export const STEP_LIMIT_MS = 12_000;
/** 演出を待つ。失敗しても上限を過ぎても、そこで切り上げる（盤面を進めるのは呼んだ側） */
async function settle(p: Promise<unknown> | undefined): Promise<void> {
  if (!p) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([p, new Promise<void>((r) => (timer = setTimeout(r, STEP_LIMIT_MS)))]);
  } catch (e) {
    console.warn("[対戦] 演出で失敗しました。盤面だけ進めます", e);
  } finally {
    clearTimeout(timer);
  }
}
/**
 * 対戦の始めのオープニング（両者のデッキを見せる）の長さ（ms）。この間は CPU も相手の手も止めておく。
 * テストでは待たない。動きを減らす設定のときは短く
 */
export function openingMs(): number {
  if (import.meta.env.MODE === "test" || typeof window === "undefined") return 0;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1200 : 2200;
}
/** オープニングが終わる時刻（Date.now()）。それまでは CPU を動かさず、届いた相手の手も見せない */
let openingEnds = 0;
const openingLeft = () => Math.max(0, openingEnds - Date.now());
/** 届いた手を見せている run（runId）。つなぎ直したら runId が変わり、古い run は次の区切りで止まる */
let drainingRun: number | null = null;

type PlaceAction = Extract<Action, { type: "play" }>;

/**
 * 出したキャラクターだけを場に置いた、効果の前の姿（演出のあいだ画面に出す）。
 * 【場に出たとき】の自分への強化（クサハミなど）は、まだ足さない（「+N」を見せてから数字を上げる）
 */
function placedOnly(prev: GameState, a: PlaceAction, events: GameEvent[], next: GameState): GameState {
  const placed = next.players[a.player].field[a.slot];
  if (!placed) return prev;
  const unit = beforeBuffs(placed, a.player, a.slot, events);
  const me = prev.players[a.player];
  const after = next.players[a.player];
  return {
    ...prev,
    players: {
      ...prev.players,
      [a.player]: {
        ...me,
        mana: after.mana,
        hand: me.hand.filter((_, i) => i !== a.handIndex),
        field: me.field.map((u, i) => (i === a.slot ? unit : u)),
      },
    },
  };
}

const isPlace = (a: Action): a is PlaceAction => a.type === "play";

/** 出来事の中の闇堕ちの演出を、順に見せる */
async function showDarkFalls(events: GameEvent[]) {
  for (const e of events)
    if (e.type === "darkFall" && presenter?.darkFall) await presenter.darkFall(e.cardId, e.player);
}
/**
 * 演出を見せてから state を進める操作（差し出しは、選ばれたキャラクターが糸で引き抜かれるのを見せる）。
 * 攻撃は、倒れたキャラクターの【破壊されたとき】が働く・キャラクターが出るときだけ（倒れてから順に見せるため）
 */
const hasEffects = (a: Action, events: GameEvent[]) =>
  isPlace(a) ||
  a.type === "cast" ||
  a.type === "endTurn" ||
  a.type === "sacrifice" ||
  a.type === "darkFall" ||
  // 攻撃：【破壊されたとき】が働いた（抜け殻から魂が抜け出る）・効果でキャラクターが出たときは、攻撃のあとに順に見せる
  (a.type === "attack" && events.some((e) => e.type === "summoned" || e.type === "deathTriggered"));

export const useGame = create<GameStore>((set, get) => {
  const appendLog = (events: GameEvent[], fx = false) => {
    const log = get().log;
    let id = log.at(-1)?.id ?? 0;
    return [...log, ...events.map((e) => ({ id: ++id, e, ...(fx ? { fx } : {}) }))].slice(-60);
  };

  /**
   * 効果を見せる（出したキャラクターを先に置いてから）。
   * alive が false になったら（上限を過ぎて盤面を進めた・対戦が変わった）、途中の盤面を画面に出さない
   */
  const present = async (
    game: GameState,
    a: Action,
    events: GameEvent[],
    next: GameState,
    alive: () => boolean = () => true,
  ) => {
    const shown = isPlace(a) ? placedOnly(game, a, events, next) : game;
    if (shown !== game) set({ game: shown });
    await presenter?.resolveEffects?.(shown, a, events, next, (g) => {
      if (alive()) set({ game: g });
    });
  };

  /** 相手の手を見せ始める（画面が、開いている拡大・確認を閉じる） */
  const foeMoved = () => set({ foeMove: get().foeMove + 1 });

  const drain = async () => {
    const my = runId;
    if (drainingRun === my) return;
    drainingRun = my;
    try {
      if (openingLeft() > 0) await new Promise((r) => setTimeout(r, openingLeft()));
      while (inbox.length > 0 && my === runId) {
        const u = inbox.shift() as RemoteUpdate;
        const g = get().game;
        const a = u.action;
        if (a.player !== ME || a.type === "timeout" || u.state.winner) foeMoved();
        if (a.type === "attack" && presenter && g) {
          set({ animating: true });
          await settle(presenter.beforeAttack(g, a));
          if (my !== runId) break;
        }
        // 相手が出した・使ったカードは、出来事からカードを知って大きく見せる
        if (a.type === "buzz" && presenter?.buzz && g) {
          set({ animating: true });
          await settle(presenter.buzz(g, a));
          if (my !== runId) break;
        }
        if (u.events.some((e) => e.type === "darkFall") && presenter?.darkFall && g) {
          set({ animating: true });
          await settle(showDarkFalls(u.events));
          if (my !== runId) break;
        }
        if ((a.type === "play" || a.type === "cast") && a.player === CPU && presenter?.revealFoe && g) {
          const ev = u.events.find((e) => e.type === "played" || e.type === "cast");
          if (ev && "cardId" in ev) {
            set({ animating: true });
            await settle(presenter.revealFoe(g, ev.cardId, a));
            if (my !== runId) break;
          }
        }
        const fx = hasEffects(a, u.events) && !!presenter?.resolveEffects && !!g;
        if (fx && g) {
          set({ animating: true });
          let alive = true;
          await settle(present(g, a, u.events, u.state, () => alive && my === runId));
          alive = false;
          if (my !== runId) break;
        }
        set({ game: u.state, log: appendLog(u.events, fx), animating: false });
        // 自分のターンが始まった手を見せ終えたら、サーバーに知らせて時計を動かしてもらう
        if (!u.state.winner && u.state.active === ME && u.state.turn !== g?.turn) link?.ready?.(u.state.turn);
      }
    } finally {
      if (drainingRun === my) drainingRun = null;
      // つなぎ直しのあいだに届いた手は、新しい run で見せる
      if (my !== runId && inbox.length > 0) void drain();
    }
  };

  /** オンライン：操作をサーバーに送る。結果は receive で届く */
  const sendRemote = async (a: Action) => {
    if (!link) return false;
    set({ cpuBusy: true, selection: null, error: null });
    const error = await link.send(a);
    set({ cpuBusy: false, error });
    return !error;
  };

  const dispatch = (a: Action): boolean => {
    const game = get().game;
    if (!game) return false;
    if (get().mode === "online") {
      void sendRemote(a);
      return true;
    }
    try {
      const { state, events } = applyAction(game, a, CATALOG);
      const log = get().log;
      let id = log.at(-1)?.id ?? 0;
      const added = events.map((e) => ({ id: ++id, e }));
      set({ game: state, log: [...log, ...added].slice(-60), error: null });
      logMove(a, game, state);
      return true;
    } catch (e) {
      if (e instanceof RuleError) {
        set({ error: e.message });
        return false;
      }
      throw e;
    }
  };

  /**
   * 操作を反映する。演出があれば効果を見せてから state を進める（Promise を返す）。
   * 演出が無いとき（テストなど）は、その場で反映して true / false を返す
   */
  const commit = (a: Action): boolean | Promise<boolean> => {
    const game = get().game;
    if (!game || get().mode === "online" || !presenter?.resolveEffects) return dispatch(a);
    let res: ReturnType<typeof applyAction>;
    try {
      res = applyAction(game, a, CATALOG);
    } catch (e) {
      if (e instanceof RuleError) {
        set({ error: e.message });
        return false;
      }
      throw e;
    }
    const { state, events } = res;
    if (!hasEffects(a, events)) return dispatch(a);
    const my = runId;
    set({ animating: true, selection: null, error: null });
    // 演出が失敗したり止まったりしても、盤面は必ず進める（STEP_LIMIT_MS）
    let alive = true;
    return settle(showDarkFalls(events))
      .then(() => settle(present(game, a, events, state, () => alive && my === runId)))
      .then(() => {
        alive = false;
        if (my !== runId) return false;
        set({ game: state, log: appendLog(events, true), animating: false, error: null });
        logMove(a, game, state);
        return true;
      });
  };
  const then = (r: boolean | Promise<boolean>, fn: (ok: boolean) => void) =>
    r instanceof Promise ? void r.then(fn) : fn(r);

  /**
   * 差し出し待ち（フィクサー）で CPU が選ぶ番なら、すぐ選ぶ。選び終えて CPU の手番に戻ったら、CPU を動かす。
   * 自分（ME）が選ぶ番なら何もしない（画面で選んでもらう）
   */
  const settleCpu = () => {
    if (get().mode !== "cpu") return;
    const g = get().game;
    if (!g || g.winner) return;
    // 自分の選択で差し出し待ちが終わった直後もここに来る。そのときは待ちが無くても CPU の手番を再開する
    if (g.pending?.waiting.includes(CPU)) {
      // CPU が最後に選ぶときは引き抜きの演出があるので、見せ終わってから続ける
      const my = runId;
      then(commit({ type: "sacrifice", player: CPU, slot: autoSacrifice(g, CPU, CATALOG) }), (ok) => {
        if (ok && my === runId) settleCpu();
      });
      return;
    }
    if (!g.pending && g.active === CPU && !get().cpuBusy) runCpu();
  };

  /** CPU のターンを planTurnSearch（先読みする CPU）の通りに1手ずつ進める */
  const runCpu = () => {
    const game = get().game;
    if (!game || game.winner || game.active !== CPU) return;
    // 差し出し待ち：CPU が選ぶ番なら選ぶ。自分（ME）が選ぶ番なら、選んでもらうまで待つ
    if (game.pending) {
      if (game.pending.waiting.includes(CPU)) settleCpu();
      return;
    }
    const my = runId;
    const actions = planTurnSearch(game, CPU, CATALOG, { onThink: logThought });
    set({ cpuBusy: true, selection: null });
    const delay = get().cpuDelay;
    const finish = () => {
      if (my !== runId) return;
      set({ cpuBusy: false });
      // 追加のターンなら、続けてもう一度 CPU が動く（差し出し待ちのときは、選び終わるまで待つ）
      const g = get().game;
      if (g && !g.winner && g.active === CPU && !g.pending) runCpu();
    };
    if (delay <= 0) {
      for (const a of actions) if (!dispatch(a)) break;
      finish();
      return;
    }
    let i = 0;
    const next = async () => {
      if (my !== runId) return;
      const a = actions[i++];
      const g = get().game;
      if (!a || !g || g.winner) return finish();
      // 相手（ME）の差し出しを待っている間は止まる（選んだら settleCpu から続きを考え直す）
      if (g.pending && !g.pending.waiting.includes(CPU)) return finish();
      foeMoved();
      if (a.type === "attack" && presenter) await settle(presenter.beforeAttack(g, a));
      if (a.type === "buzz" && presenter?.buzz) await settle(presenter.buzz(g, a));
      if ((a.type === "play" || a.type === "cast") && presenter?.revealFoe) {
        const id = g.players[CPU].hand[a.handIndex];
        if (id) await settle(presenter.revealFoe(g, id, a));
      }
      if (my !== runId) return;
      if (!(await commit(a))) return finish();
      if (my !== runId) return;
      setTimeout(next, a.type === "endTurn" ? 0 : delay);
    };
    setTimeout(next, delay + (presenter?.turnIntro ?? 0));
  };

  return {
    mode: "cpu",
    foeName: "CPU",
    deck: null,
    foeDeckRef: null,
    opening: 0,
    game: null,
    log: [],
    error: null,
    selection: null,
    cpuBusy: false,
    cpuDelay: 900,
    animating: false,
    foeMove: 0,
    start: (deck, opts = {}) => {
      runId++;
      link = null;
      inbox = [];
      const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
      const first = opts.first ?? (seed % 2 === 0 ? ME : CPU);
      // CPU は構築済みデッキから、自分と違うものを使う
      const others = (Object.keys(DECKS) as DeckId[]).filter((d) => d !== deck.ref);
      const cpuDeck = others[seed % others.length] as DeckId;
      const game = createGame({
        decks: { [ME]: deck.cards, [CPU]: DECKS[cpuDeck] } as never,
        seed,
        first,
      });
      // CPU を強くするための記録（一手ずつ。終わったらサーバーへ送る）
      abandonCpuLog(get().game);
      beginCpuLog({
        catalog: CATALOG,
        human: ME,
        cpu: CPU,
        humanDeck: { ref: deck.ref, name: deck.name, cards: deck.cards },
        cpuDeck: { ref: cpuDeck, cards: [...DECKS[cpuDeck]] },
        seed,
        first,
        initial: game,
      });
      openingEnds = Date.now() + openingMs();
      set({
        mode: "cpu",
        foeName: "CPU",
        deck,
        foeDeckRef: cpuDeck,
        opening: get().opening + 1,
        game,
        log: [{ id: 1, e: { type: "turnStarted", player: first, turn: 1, mana: game.players[first].mana } }],
        error: null,
        selection: null,
        cpuBusy: false,
        animating: false,
      });
      const my = runId;
      const wait = openingLeft();
      if (wait > 0) setTimeout(() => my === runId && runCpu(), wait);
      else runCpu();
    },
    startTutorial: () => {
      // CPU 対戦の途中から来たら、そこまでの記録を送る。チュートリアルの手は記録しない（beginCpuLog を呼ばない）
      abandonCpuLog(get().game);
      runId++;
      link = null;
      inbox = [];
      const game = createTutorialGame();
      set({
        mode: "tutorial",
        foeName: "CPU",
        deck: TUTORIAL_DECK,
        foeDeckRef: null,
        game,
        log: [
          { id: 1, e: { type: "turnStarted", player: ME, turn: game.turn, mana: game.players[ME].mana } },
        ],
        error: null,
        selection: null,
        cpuBusy: false,
        animating: false,
      });
    },
    quit: () => {
      abandonCpuLog(get().game);
      runId++;
      link = null;
      inbox = [];
      set({
        mode: "cpu",
        foeName: "CPU",
        deck: null,
        foeDeckRef: null,
        game: null,
        log: [],
        error: null,
        selection: null,
        cpuBusy: false,
        animating: false,
      });
    },
    select: (selection) => set({ selection, error: null }),
    play: (slot) => {
      const sel = get().selection;
      if (!sel || get().cpuBusy || get().animating) return;
      if (sel.kind !== "hand") return;
      const a: Action = { type: "play", player: ME, handIndex: sel.index, slot };
      then(commit(a), (ok) => {
        if (!ok) return;
        set({ selection: null });
        settleCpu();
      });
    },
    sacrifice: (slot) => {
      const g = get().game;
      if (!g?.pending?.waiting.includes(ME) || get().animating) return;
      then(commit({ type: "sacrifice", player: ME, slot }), (ok) => {
        if (!ok) return;
        set({ selection: null });
        settleCpu();
      });
    },
    darkFall: (slot) => {
      if (!get().game || get().cpuBusy || get().animating) return;
      then(commit({ type: "darkFall", player: ME, slot }), (ok) => ok && set({ selection: null }));
    },
    cast: (target) => {
      const sel = get().selection;
      if (sel?.kind !== "hand" || get().cpuBusy || get().animating) return;
      then(
        commit({ type: "cast", player: ME, handIndex: sel.index, target }),
        (ok) => ok && set({ selection: null }),
      );
    },
    attack: (target) => {
      const sel = get().selection;
      const game = get().game;
      if (sel?.kind !== "attacker" || get().cpuBusy || get().animating || !game) return;
      const a: Action = { type: "attack", player: ME, from: sel.slot, target };
      // オンラインでは、演出はサーバーから結果が届いてから
      if (!presenter || get().mode === "online") {
        dispatch(a);
        set({ selection: null });
        return;
      }
      const my = runId;
      set({ animating: true, selection: null });
      settle(presenter.beforeAttack(game, a)).then(() => {
        if (my !== runId) return;
        then(commit(a), () => {
          if (my === runId) set({ animating: false });
        });
      });
    },
    buzz: (slot) => {
      const game = get().game;
      if (!game || get().cpuBusy || get().animating) return;
      const a: Action = { type: "buzz", player: ME, slot };
      try {
        applyAction(game, a, CATALOG);
      } catch (e) {
        if (e instanceof RuleError) return set({ error: e.message, selection: null });
        throw e;
      }
      // オンラインでは、演出はサーバーから結果が届いてから
      if (!presenter?.buzz || get().mode === "online") {
        dispatch(a);
        set({ selection: null });
        return;
      }
      const my = runId;
      set({ animating: true, selection: null });
      settle(presenter.buzz(game, a)).then(() => {
        if (my !== runId) return;
        dispatch(a);
        set({ animating: false });
      });
    },
    endTurn: () => {
      if (get().cpuBusy || get().animating) return;
      then(commit({ type: "endTurn", player: ME }), (ok) => {
        if (!ok) return;
        set({ selection: null });
        if (get().mode === "cpu") runCpu();
      });
    },
    startOnline: ({ deck, foeName, foeDeckRef, state, link: l }) => {
      if (get().mode === "cpu") abandonCpuLog(get().game);
      const same = get().mode === "online" && get().deck?.ref === deck.ref && link === l;
      // つなぎ直しでも、見せている途中の古い手は打ち切る（終わったあとに、届いた最新の盤面を古い盤面で上書きしないように）
      runId++;
      // 始まったばかりの対戦に入ったときだけオープニングを見せる（途中からの再接続では見せない）
      const fresh = !same && state.turn === 1;
      if (fresh) openingEnds = Date.now() + openingMs();
      link = l;
      inbox = [];
      set({
        mode: "online",
        foeName,
        deck,
        foeDeckRef: foeDeckRef ?? null,
        opening: fresh ? get().opening + 1 : get().opening,
        game: state,
        // 再接続のときは記録を残す
        log: same ? get().log : [],
        error: null,
        selection: null,
        cpuBusy: false,
        animating: false,
      });
    },
    receive: (u) => {
      if (get().mode !== "online") return;
      inbox.push(u);
      void drain();
    },
    resign: () => link?.resign(),
  };
});

// CPU 対戦の途中で画面を閉じたら、そこまでの記録を送る
watchPageHide(() => (useGame.getState().mode === "cpu" ? useGame.getState().game : null));

// 開発中だけ、ブラウザから対戦の状態を触れるようにする（演出の確認用）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __trends?: typeof useGame }).__trends = useGame;
}
