import { CARDS, type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  type Action,
  type AttackTarget,
  applyAction,
  createGame,
  type GameEvent,
  type GameState,
  type PlayerId,
  planTurn,
  RuleError,
} from "@trends/game-core";
import { create } from "zustand";

export const CATALOG: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const DECK_INFO: Record<DeckId, { name: string; text: string }> = {
  heaven: { name: "ヘブン", text: "光輪・蒼空。ガードと拡散で粘り、シロガネとミナモで押し返す" },
  inferno: { name: "インフェルノ", text: "紅蓮。速攻と炎上で、早めに削り切る" },
};

export const ME: PlayerId = "p1";
export const CPU: PlayerId = "p2";

type Selection = { kind: "hand"; index: number } | { kind: "attacker"; slot: number } | null;

export interface LogEntry {
  id: number;
  e: GameEvent;
}

interface GameStore {
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
  start: (deck: DeckId, opts?: { seed?: number; first?: PlayerId }) => void;
  quit: () => void;
  select: (s: Selection) => void;
  play: (slot: number) => void;
  attack: (target: AttackTarget) => void;
  endTurn: () => void;
}

/** start / quit のたびに増やし、古い CPU の処理を止める */
let runId = 0;

export const useGame = create<GameStore>((set, get) => {
  const dispatch = (a: Action): boolean => {
    const game = get().game;
    if (!game) return false;
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

  /** CPU のターンを planTurn の通りに1手ずつ進める */
  const runCpu = () => {
    const game = get().game;
    if (!game || game.winner || game.active !== CPU) return;
    const my = runId;
    const actions = planTurn(game, CPU, CATALOG);
    set({ cpuBusy: true, selection: null });
    const delay = get().cpuDelay;
    const finish = () => {
      if (my === runId) set({ cpuBusy: false });
    };
    if (delay <= 0) {
      for (const a of actions) if (!dispatch(a)) break;
      finish();
      return;
    }
    let i = 0;
    const next = () => {
      if (my !== runId) return;
      const a = actions[i++];
      if (!a || get().game?.winner) return finish();
      if (!dispatch(a)) return finish();
      setTimeout(next, a.type === "endTurn" ? 0 : delay);
    };
    setTimeout(next, delay);
  };

  return {
    deck: null,
    game: null,
    log: [],
    error: null,
    selection: null,
    cpuBusy: false,
    cpuDelay: 700,
    start: (deck, opts = {}) => {
      runId++;
      const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
      const first = opts.first ?? (seed % 2 === 0 ? ME : CPU);
      const cpuDeck: DeckId = deck === "heaven" ? "inferno" : "heaven";
      const game = createGame({ decks: { [ME]: DECKS[deck], [CPU]: DECKS[cpuDeck] } as never, seed, first });
      set({
        deck,
        game,
        log: [{ id: 1, e: { type: "turnStarted", player: first, turn: 1, mana: game.players[first].mana } }],
        error: null,
        selection: null,
        cpuBusy: false,
      });
      runCpu();
    },
    quit: () => {
      runId++;
      set({ deck: null, game: null, log: [], error: null, selection: null, cpuBusy: false });
    },
    select: (selection) => set({ selection, error: null }),
    play: (slot) => {
      const sel = get().selection;
      if (sel?.kind !== "hand" || get().cpuBusy) return;
      if (dispatch({ type: "play", player: ME, handIndex: sel.index, slot })) set({ selection: null });
    },
    attack: (target) => {
      const sel = get().selection;
      if (sel?.kind !== "attacker" || get().cpuBusy) return;
      dispatch({ type: "attack", player: ME, from: sel.slot, target });
      set({ selection: null });
    },
    endTurn: () => {
      if (get().cpuBusy || !dispatch({ type: "endTurn", player: ME })) return;
      set({ selection: null });
      runCpu();
    },
  };
});
