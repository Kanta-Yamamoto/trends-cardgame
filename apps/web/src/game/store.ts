import { CARDS, type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  type Action,
  type AttackTarget,
  applyAction,
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

export const DECK_INFO: Record<DeckId, { name: string; text: string }> = {
  flame: {
    name: "大炎上で草",
    text: "炎上×草。配信者を並べてコラボ配信で殴り、速攻と連撃で早めに削る。エースは炎上系配信者 レン",
  },
  idol: {
    name: "推しに癒される",
    text: "メロい×癒し。アイドルをそろえてファンレターとプロデューサーで育て、ガードと回復で守り切る。エースはトップアイドル",
  },
  expert: {
    name: "有識者の守り",
    text: "神×癒し。有識者をそろえて引用リツイートで引き続け、ガードと除去で盤面を取る。エースは癒しボイス ナギ",
  },
  ronpa: {
    name: "論破で炎上",
    text: "炎上×神。有識者と配信者の両方を使い、凸と除去で相手のアイコンを減らして押し切る。エースは専門家",
  },
  dance: {
    name: "踊ってみたで草",
    text: "草×メロい。アイドルとミームを並べ、ファンレターと生誕祭でみんなで強くなる。エースは伝説のコラ画像",
  },
  scandal: {
    name: "推しが炎上",
    text: "炎上×メロい。配信者を並べてコラボ配信で殴り、炎上中のアイドルで晒す。エースは炎上請負人 カグラ",
  },
  phoenix: {
    name: "燃えても癒える",
    text: "炎上×癒し。配信者をそろえて同接感謝で守り、回復するたびに相手を燃やす。エースはととのい師 ユズハ",
  },
  wiki: {
    name: "草にマジレス",
    text: "神×草。ミームを増やしてミーム考古学者で強め、一斉に攻めて仕留める。エースは知の番人 ヨミ",
  },
  theory: {
    name: "推しを考察",
    text: "神×メロい。アイドル評論家で引き、プロデューサーでアイドルを育てて押し切る。エースは神絵師 シロガネ",
  },
  chill: {
    name: "ゆるいTL",
    text: "草×癒し。ミームと動物を並べ、もふもふタイムで守りながら数で押す。エースは大草原の主 ワラ",
  },
  solo_flame: {
    name: "燃やし尽くす",
    text: "炎上だけ。速攻と凸で序盤から殴り切り、晒しで強化を消す。エースはレンとカグラ",
  },
  solo_idol: {
    name: "推しに全振り",
    text: "メロいだけ。アイドルをそろえて育て、ラスサビで全員が跳ぶ。エースはトップアイドルとドームの歌姫 ミレイ",
  },
  solo_expert: {
    name: "有識者会議",
    text: "神だけ。有識者で引き続け、確実に除去して盤面を取る。エースは専門家・シロガネ・ヨミ",
  },
  solo_meme: {
    name: "草しか生えない",
    text: "草だけ。草で場を埋めて数で押し、伸びるリプ欄で引き続ける。エースはワラとバズの申し子 ララ",
  },
  solo_heal: {
    name: "癒しの楽園",
    text: "癒しだけ。回復で粘って、回復するたびに相手を燃やす。エースはユズハ・ルリ・ナギ",
  },
};

export const ME: PlayerId = "p1";
export const CPU: PlayerId = "p2";

type Selection =
  | { kind: "hand"; index: number }
  | { kind: "attacker"; slot: number }
  /** オワコンの闇堕ちできるカードを選んで、出す枠を待っている */
  | { kind: "dark"; cardId: string }
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
  /** バズ：出したターンのアイコンに話題力 1 を払って +1/+1 と凸 */
  buzz: (slot: number) => void;
  endTurn: () => void;
  /** オンライン対戦を始める（再接続のときも、届いた状態で呼び直す） */
  startOnline: (o: { deck: DeckSel; foeName: string; state: GameState; link: RemoteLink }) => void;
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
}
let presenter: Presenter | null = null;
export const setPresenter = (p: Presenter | null) => {
  presenter = p;
};

let link: RemoteLink | null = null;
/** サーバーから届いた手を、順番に1つずつ反映する */
let inbox: RemoteUpdate[] = [];
let draining = false;

type PlaceAction = Extract<Action, { type: "play" | "darkFall" }>;

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
        hand: a.type === "play" ? me.hand.filter((_, i) => i !== a.handIndex) : me.hand,
        trash: a.type === "darkFall" ? after.trash : me.trash,
        field: me.field.map((u, i) => (i === a.slot ? unit : u)),
      },
    },
  };
}

const isPlace = (a: Action): a is PlaceAction => a.type === "play" || a.type === "darkFall";
const hasEffects = (a: Action) =>
  isPlace(a) || a.type === "cast" || a.type === "endTurn" || a.type === "buzz";

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
      if (a.type === "darkFall" && presenter?.darkFall && g) {
        set({ animating: true });
        await presenter.darkFall(a.cardId, a.player);
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
    const intro =
      a.type === "darkFall" && presenter.darkFall
        ? presenter.darkFall(a.cardId, a.player)
        : Promise.resolve();
    return intro
      .then(() => present(game, a, events, state))
      .then(() => {
        if (my !== runId) return false;
        set({ game: state, log: appendLog(events, true), animating: false, error: null });
        return true;
      });
  };
  const then = (r: boolean | Promise<boolean>, fn: (ok: boolean) => void) =>
    r instanceof Promise ? void r.then(fn) : fn(r);

  /** CPU のターンを planTurnSearch（先読みする CPU）の通りに1手ずつ進める */
  const runCpu = () => {
    const game = get().game;
    if (!game || game.winner || game.active !== CPU) return;
    const my = runId;
    const actions = planTurnSearch(game, CPU, CATALOG);
    set({ cpuBusy: true, selection: null });
    const delay = get().cpuDelay;
    const finish = () => {
      if (my !== runId) return;
      set({ cpuBusy: false });
      // 追加のターンなら、続けてもう一度 CPU が動く
      const g = get().game;
      if (g && !g.winner && g.active === CPU) runCpu();
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
      if (a.type === "attack" && presenter) await presenter.beforeAttack(g, a);
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
      set({
        mode: "cpu",
        foeName: "CPU",
        deck,
        game,
        log: [{ id: 1, e: { type: "turnStarted", player: first, turn: 1, mana: game.players[first].mana } }],
        error: null,
        selection: null,
        cpuBusy: false,
        animating: false,
      });
      runCpu();
    },
    quit: () => {
      runId++;
      link = null;
      inbox = [];
      set({
        mode: "cpu",
        foeName: "CPU",
        deck: null,
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
      const a: Action | null =
        sel.kind === "hand"
          ? { type: "play", player: ME, handIndex: sel.index, slot }
          : sel.kind === "dark"
            ? { type: "darkFall", player: ME, cardId: sel.cardId, slot }
            : null;
      if (!a) return;
      then(commit(a), (ok) => ok && set({ selection: null }));
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
      if (get().cpuBusy || get().animating) return;
      then(commit({ type: "buzz", player: ME, slot }), (ok) => ok && set({ selection: null }));
    },
    endTurn: () => {
      if (get().cpuBusy || get().animating) return;
      then(commit({ type: "endTurn", player: ME }), (ok) => {
        if (!ok) return;
        set({ selection: null });
        if (get().mode === "cpu") runCpu();
      });
    },
    startOnline: ({ deck, foeName, state, link: l }) => {
      const same = get().mode === "online" && get().deck?.ref === deck.ref && link === l;
      if (!same) runId++;
      link = l;
      inbox = [];
      draining = false;
      set({
        mode: "online",
        foeName,
        deck,
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
