import { nextRandom } from "./rng";
import type { GameEvent, GameState, PlayerId, RuleCard } from "./types";

export interface AbilityCtx {
  state: GameState;
  player: PlayerId;
  catalog: Record<string, RuleCard>;
  emit: (e: GameEvent) => void;
}

export interface Ability {
  /** 支払うコストの補正（負の数で軽くなる） */
  costModifier?: (ctx: Omit<AbilityCtx, "emit">) => number;
  onPlay?: (ctx: AbilityCtx) => void;
  onAttack?: (ctx: AbilityCtx) => void;
}

export const opponent = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

/** カードIDごとの効果。新しいカードの効果はここに足す */
export const ABILITIES: Record<string, Ability> = {
  // シロガネ：場にある他の〈光輪〉1枚につきコスト-1
  c1: {
    costModifier: ({ state, player, catalog }) =>
      -state.players[player].field.filter((u) => u && catalog[u.cardId]?.tribe === "光輪").length,
  },
  // レン：攻撃したとき、相手の手札を1枚捨てさせる（どれを捨てるかは乱数）
  c2: {
    onAttack: ({ state, player, emit }) => {
      const foe = state.players[opponent(player)];
      if (foe.hand.length === 0) return;
      const [r, seed] = nextRandom(state.seed);
      state.seed = seed;
      const [cardId] = foe.hand.splice(Math.floor(r * foe.hand.length), 1);
      if (cardId) {
        foe.trash.push(cardId);
        emit({ type: "discarded", player: opponent(player), cardId });
      }
    },
  },
  // ミナモ：山札の上から3枚を見て〈蒼空〉1枚を手札に、残りは山札の下へ
  c3: {
    onPlay: ({ state, player, catalog, emit }) => {
      const me = state.players[player];
      const looked = me.deck.splice(0, 3);
      const idx = looked.findIndex((id) => catalog[id]?.tribe === "蒼空");
      const added = idx >= 0 ? (looked[idx] ?? null) : null;
      if (added) me.hand.push(added);
      me.deck.push(...looked.filter((_, i) => i !== idx));
      emit({ type: "searched", player, looked, added });
    },
  },
};
