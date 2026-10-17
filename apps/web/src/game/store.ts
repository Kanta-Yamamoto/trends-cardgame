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

export const CATALOG: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const DECK_INFO: Record<DeckId, { name: string; text: string }> = {
  flame: {
    name: "大炎上で草",
    text: "炎上×草。速攻と連撃で早めに削る。エースは炎上系配信者 レンと炎上女王 ヒバナ",
  },
  idol: {
    name: "推しに癒される",
    text: "メロい×癒し。注目で推しを育て、ガードと回復で守り切る。エースはトップアイドル",
  },
  expert: {
    name: "有識者の守り",
    text: "神×癒し。ガードで守りながら引き続け、除去で盤面を取る。エースは神絵師 シロガネと癒しボイス ナギ",
  },
  ronpa: {
    name: "論破で炎上",
    text: "炎上×神。叩きと除去で相手のアイコンを減らし、押し切る。エースは論破系配信者",
  },
  dance: {
    name: "踊ってみたで草",
    text: "草×メロい。草を増やして並べ、みんなで強くなる。エースは伝説のコラ画像",
  },
};

export const ME: PlayerId = "p1";
export const CPU: PlayerId = "p2";

type Selection = { kind: "hand"; index: number } | { kind: "attacker"; slot: number } | null;

export interface LogEntry {
  id: number;
  e: GameEvent;
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
  /** 自分が選んだデッキ。null ならデッキ選択画面 */
  deck: DeckId | null;
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
  start: (deck: DeckId, opts?: { seed?: number; first?: PlayerId }) => void;
  quit: () => void;
  select: (s: Selection) => void;
  play: (slot: number) => void;
  /** 選んでいる手札の投稿を使う（対象が要るものは target を渡す） */
  cast: (target?: CastTarget) => void;
  attack: (target: AttackTarget) => void;
  endTurn: () => void;
  /** オンライン対戦を始める（再接続のときも、届いた状態で呼び直す） */
  startOnline: (o: { deck: DeckId; foeName: string; state: GameState; link: RemoteLink }) => void;
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
  /** 相手がカードを出す・投稿を使う前に、そのカードを大きく見せる */
  revealFoe?: (
    game: GameState,
    cardId: string,
    action: Extract<Action, { type: "play" | "cast" }>,
  ) => Promise<void>;
}
let presenter: Presenter | null = null;
export const setPresenter = (p: Presenter | null) => {
  presenter = p;
};

let link: RemoteLink | null = null;
/** サーバーから届いた手を、順番に1つずつ反映する */
let inbox: RemoteUpdate[] = [];
let draining = false;

export const useGame = create<GameStore>((set, get) => {
  const appendLog = (events: GameEvent[]) => {
    const log = get().log;
    let id = log.at(-1)?.id ?? 0;
    return [...log, ...events.map((e) => ({ id: ++id, e }))].slice(-60);
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
      if ((a.type === "play" || a.type === "cast") && a.player === CPU && presenter?.revealFoe && g) {
        const ev = u.events.find((e) => e.type === "played" || e.type === "cast");
        if (ev && "cardId" in ev) {
          set({ animating: true });
          await presenter.revealFoe(g, ev.cardId, a);
          if (my !== runId) break;
        }
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
      if (!dispatch(a)) return finish();
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
      const others = (Object.keys(DECKS) as DeckId[]).filter((d) => d !== deck);
      const cpuDeck = others[seed % others.length] as DeckId;
      const game = createGame({ decks: { [ME]: DECKS[deck], [CPU]: DECKS[cpuDeck] } as never, seed, first });
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
      if (sel?.kind !== "hand" || get().cpuBusy || get().animating) return;
      if (dispatch({ type: "play", player: ME, handIndex: sel.index, slot })) set({ selection: null });
    },
    cast: (target) => {
      const sel = get().selection;
      if (sel?.kind !== "hand" || get().cpuBusy || get().animating) return;
      if (dispatch({ type: "cast", player: ME, handIndex: sel.index, target })) set({ selection: null });
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
    endTurn: () => {
      if (get().cpuBusy || get().animating || !dispatch({ type: "endTurn", player: ME })) return;
      set({ selection: null });
      if (get().mode === "cpu") runCpu();
    },
    startOnline: ({ deck, foeName, state, link: l }) => {
      const same = get().mode === "online" && get().deck === deck && link === l;
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
