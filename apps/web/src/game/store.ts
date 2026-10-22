import { CARDS, type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  type Action,
  type AttackTarget,
  applyAction,
  autoSacrifice,
  type CastTarget,
  createGame,
  type GameEvent,
  type GameState,
  type PlayerId,
  planTurnSearch,
  RuleError,
} from "@trends/game-core";
import { create } from "zustand";
import type { DeckSel } from "./decks";

export const CATALOG: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** 構築済みデッキの名前・説明と、デッキ選択のサムネに出すエース（★5） */
export const DECK_INFO: Record<DeckId, { name: string; text: string; ace?: string }> = {
  solo_flame: {
    ace: "c2",
    name: "炎上アグロ",
    text: "「レン」の連撃と闇堕ちで、相手が守る前に押し切ろう",
  },
  solo_idol: {
    ace: "c13",
    name: "メロいミッドレンジ",
    text: "「ミレイ」で育てたアイコンをそろえて、一斉攻撃を決めよう",
  },
  solo_expert: {
    ace: "g4",
    name: "神コントロール",
    text: "「専門家」の闇堕ちで、山札を引き切っての勝利を目指そう",
  },
  solo_meme: {
    ace: "k5",
    name: "草アグロ",
    text: "「コラ画像」で並べた草をそろえて、数で押し切ろう",
  },
  solo_heal: {
    ace: "c5",
    name: "癒しコントロール",
    text: "「ナギ」で相手を眠らせ、回復しながら守り切ろう",
  },
  fixer_meme: {
    ace: "c15",
    name: "草ミッドレンジ",
    text: "「クサハミ」の闇堕ち能力で一撃勝利を目指そう",
  },
  unei_idol: {
    ace: "c17",
    name: "運営ミッドレンジ",
    text: "「演出家」で両者のエースを舞台に上げ、「調停者」と「フィクサー」で場を裁こう",
  },
};

export const ME: PlayerId = "p1";
export const CPU: PlayerId = "p2";

type Selection =
  | { kind: "hand"; index: number }
  | { kind: "attacker"; slot: number }
  /** バズさせる自分のアイコンを選んでいる */
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
}

interface GameStore {
  /** cpu＝CPU と対戦／online＝ほかの人と対戦（状態はサーバーから届く） */
  mode: "cpu" | "online";
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
  start: (deck: DeckSel, opts?: { seed?: number; first?: PlayerId }) => void;
  quit: () => void;
  select: (s: Selection) => void;
  play: (slot: number) => void;
  /** 選んでいる手札の投稿を使う（対象が要るものは target を渡す） */
  cast: (target?: CastTarget) => void;
  attack: (target: AttackTarget) => void;
  endTurn: () => void;
  /** バズ：選んだ自分のアイコンに +2/+2 と凸（カットインを見せてから） */
  buzz: (slot: number) => void;
  /** 差し出し（フィクサー）：自分のアイコンを1体選ぶ */
  sacrifice: (slot: number) => void;
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
   * 出す・投稿・ターン終了の効果を見せる（state を進める前）。
   * shown は今画面に出ている state（出したアイコンは場に置いた姿）、next は効果がすべて済んだ state
   */
  resolveEffects?: (shown: GameState, action: Action, events: GameEvent[], next: GameState) => Promise<void>;
  /** 相手がカードを出す・投稿を使う前に、そのカードを大きく見せる */
  revealFoe?: (
    game: GameState,
    cardId: string,
    action: Extract<Action, { type: "play" | "cast" }>,
  ) => Promise<void>;
  /** 闇堕ちの演出（画面全体）。自分・相手どちらの闇堕ちでも、state を進める前に見せる */
  darkFall?: (cardId: string, player: PlayerId) => Promise<void>;
  /** バズのカットイン（マスターとバズ）。state を進める前に見せる */
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
 * 対戦の始めのオープニング（両者のデッキを見せる）の長さ（ms）。この間は CPU も相手の手も止めておく。
 * テストでは待たない。動きを減らす設定のときは短く
 */
export function openingMs(): number {
  if (import.meta.env.MODE === "test" || typeof window === "undefined") return 0;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1200 : 2700;
}
/** オープニングが終わる時刻（Date.now()）。それまでは CPU を動かさず、届いた相手の手も見せない */
let openingEnds = 0;
const openingLeft = () => Math.max(0, openingEnds - Date.now());
let draining = false;

type PlaceAction = Extract<Action, { type: "play" }>;

/** 出したアイコンだけを場に置いた、効果の前の姿（演出のあいだ画面に出す） */
function placedOnly(prev: GameState, a: PlaceAction, next: GameState): GameState {
  const unit = next.players[a.player].field[a.slot];
  if (!unit) return prev;
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

/** 出来事の中の闇堕ち（ターンの始めに自動で起きる）の演出を、順に見せる */
async function showDarkFalls(events: GameEvent[]) {
  for (const e of events)
    if (e.type === "darkFall" && presenter?.darkFall) await presenter.darkFall(e.cardId, e.player);
}
const hasEffects = (a: Action) => isPlace(a) || a.type === "cast" || a.type === "endTurn";

export const useGame = create<GameStore>((set, get) => {
  const appendLog = (events: GameEvent[], fx = false) => {
    const log = get().log;
    let id = log.at(-1)?.id ?? 0;
    return [...log, ...events.map((e) => ({ id: ++id, e, ...(fx ? { fx } : {}) }))].slice(-60);
  };

  /** 効果を見せる（出したアイコンを先に置いてから） */
  const present = async (game: GameState, a: Action, events: GameEvent[], next: GameState) => {
    const shown = isPlace(a) ? placedOnly(game, a, next) : game;
    if (shown !== game) set({ game: shown });
    await presenter?.resolveEffects?.(shown, a, events, next);
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    const my = runId;
    if (openingLeft() > 0) await new Promise((r) => setTimeout(r, openingLeft()));
    while (inbox.length > 0 && my === runId) {
      const u = inbox.shift() as RemoteUpdate;
      const g = get().game;
      if (u.action.type === "attack" && presenter && g) {
        set({ animating: true });
        await presenter.beforeAttack(g, u.action);
        if (my !== runId) break;
      }
      // 相手が出した・使ったカードは、出来事からカードを知って大きく見せる
      const a = u.action;
      if (a.type === "buzz" && presenter?.buzz && g) {
        set({ animating: true });
        await presenter.buzz(g, a);
        if (my !== runId) break;
      }
      if (u.events.some((e) => e.type === "darkFall") && presenter?.darkFall && g) {
        set({ animating: true });
        await showDarkFalls(u.events);
        if (my !== runId) break;
      }
      if ((a.type === "play" || a.type === "cast") && a.player === CPU && presenter?.revealFoe && g) {
        const ev = u.events.find((e) => e.type === "played" || e.type === "cast");
        if (ev && "cardId" in ev) {
          set({ animating: true });
          await presenter.revealFoe(g, ev.cardId, a);
          if (my !== runId) break;
        }
      }
      if (hasEffects(a) && presenter?.resolveEffects && g) {
        set({ animating: true });
        await present(g, a, u.events, u.state);
        if (my !== runId) break;
        set({ game: u.state, log: appendLog(u.events, true), animating: false });
        continue;
      }
      set({ game: u.state, log: appendLog(u.events), animating: false });
    }
    draining = false;
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
    if (!game || get().mode === "online" || !presenter?.resolveEffects || !hasEffects(a)) return dispatch(a);
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
    const my = runId;
    set({ animating: true, selection: null, error: null });
    return showDarkFalls(events)
      .then(() => present(game, a, events, state))
      .then(() => {
        if (my !== runId) return false;
        set({ game: state, log: appendLog(events, true), animating: false, error: null });
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
    if (g.pending?.waiting.includes(CPU))
      dispatch({ type: "sacrifice", player: CPU, slot: autoSacrifice(g, CPU, CATALOG) });
    const after = get().game;
    if (after && !after.pending && !after.winner && after.active === CPU && !get().cpuBusy) runCpu();
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
    const actions = planTurnSearch(game, CPU, CATALOG);
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
      if (a.type === "attack" && presenter) await presenter.beforeAttack(g, a);
      if (a.type === "buzz" && presenter?.buzz) await presenter.buzz(g, a);
      if ((a.type === "play" || a.type === "cast") && presenter?.revealFoe) {
        const id = g.players[CPU].hand[a.handIndex];
        if (id) await presenter.revealFoe(g, id, a);
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
    quit: () => {
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
      if (!dispatch({ type: "sacrifice", player: ME, slot })) return;
      set({ selection: null });
      settleCpu();
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
      presenter.beforeAttack(game, a).then(() => {
        if (my !== runId) return;
        dispatch(a);
        set({ animating: false });
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
      presenter.buzz(game, a).then(() => {
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
      const same = get().mode === "online" && get().deck?.ref === deck.ref && link === l;
      if (!same) runId++;
      // 始まったばかりの対戦に入ったときだけオープニングを見せる（途中からの再接続では見せない）
      const fresh = !same && state.turn === 1;
      if (fresh) openingEnds = Date.now() + openingMs();
      link = l;
      inbox = [];
      draining = false;
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

// 開発中だけ、ブラウザから対戦の状態を触れるようにする（演出の確認用）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __trends?: typeof useGame }).__trends = useGame;
}
