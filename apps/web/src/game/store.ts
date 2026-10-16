import { CARDS } from "@trends/cards";
import {
  type Action,
  type AttackTarget,
  applyAction,
  createGame,
  type GameEvent,
  type GameState,
  type RuleCard,
  RuleError,
} from "@trends/game-core";
import { create } from "zustand";

/** デモ用の相手カード（イラストなし） */
export const TOKENS: Record<string, RuleCard & { name: string }> = {
  f1: { id: "f1", name: "炎上アカウント ZERO", cost: 4, power: 5000, tribe: "炎上" },
};

export const CATALOG: Record<string, RuleCard> = {
  ...Object.fromEntries(CARDS.map((c) => [c.id, c])),
  ...TOKENS,
};

const newGame = () =>
  createGame({
    decks: { p1: ["c1", "c2", "c3", "c3", "c2", "c1"], p2: ["f1", "f1", "f1", "f1", "f1", "f1"] },
    seed: Date.now() % 100000,
  });

type Selection = { kind: "hand"; index: number } | { kind: "attacker"; slot: number } | null;

interface GameStore {
  game: GameState;
  log: { id: number; e: GameEvent }[];
  error: string | null;
  selection: Selection;
  dispatch: (a: Action) => boolean;
  select: (s: Selection) => void;
  play: (slot: number) => void;
  attack: (target: AttackTarget) => void;
  endTurn: () => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  game: newGame(),
  log: [],
  error: null,
  selection: null,
  dispatch: (a) => {
    try {
      const { state, events } = applyAction(get().game, a, CATALOG);
      const log = get().log;
      let id = log.at(-1)?.id ?? 0;
      const added = events.map((e) => ({ id: ++id, e }));
      set({ game: state, log: [...log, ...added].slice(-40), error: null });
      return true;
    } catch (e) {
      if (e instanceof RuleError) {
        set({ error: e.message });
        return false;
      }
      throw e;
    }
  },
  select: (selection) => set({ selection, error: null }),
  play: (slot) => {
    const sel = get().selection;
    if (sel?.kind !== "hand") return;
    if (get().dispatch({ type: "play", player: "p1", handIndex: sel.index, slot })) set({ selection: null });
  },
  attack: (target) => {
    const sel = get().selection;
    if (sel?.kind !== "attacker") return;
    get().dispatch({ type: "attack", player: "p1", from: sel.slot, target });
    set({ selection: null });
  },
  endTurn: () => {
    if (!get().dispatch({ type: "endTurn", player: "p1" })) return;
    set({ selection: null });
    runOpponent(get);
  },
  reset: () => set({ game: newGame(), log: [], error: null, selection: null }),
}));

/** 相手（p2）の簡単な思考：出せるカードを出し、攻撃できるカードで攻撃してターンを終える */
function runOpponent(get: () => GameStore) {
  const { dispatch } = get();
  let g = get().game;
  if (g.winner) return;
  for (let i = g.players.p2.hand.length - 1; i >= 0; i--) {
    const slot = g.players.p2.field.findIndex((u) => !u);
    if (slot < 0) break;
    dispatch({ type: "play", player: "p2", handIndex: i, slot });
    g = get().game;
  }
  g.players.p2.field.forEach((u, from) => {
    if (!u?.canAttack || get().game.winner) return;
    const myPower = CATALOG[u.cardId]?.power ?? 0;
    const p1 = get().game.players.p1.field;
    const weak = p1.findIndex((t) => t && (CATALOG[t.cardId]?.power ?? 0) < myPower);
    dispatch({
      type: "attack",
      player: "p2",
      from,
      target: weak >= 0 ? { kind: "unit", slot: weak } : { kind: "leader" },
    });
  });
  if (!get().game.winner) dispatch({ type: "endTurn", player: "p2" });
}
