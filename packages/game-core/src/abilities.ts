import { nextRandom } from "./rng";
import {
  type Config,
  DEFAULT_CONFIG,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RuleCard,
} from "./types";

export interface AbilityCtx {
  state: GameState;
  player: PlayerId;
  catalog: Record<string, RuleCard>;
  config: Config;
  emit: (e: GameEvent) => void;
}

export interface Ability {
  /** 支払うコストの補正（負の数で軽くなる） */
  costModifier?: (ctx: Omit<AbilityCtx, "emit" | "config">) => number;
  onPlay?: (ctx: AbilityCtx) => void;
  onAttack?: (ctx: AbilityCtx) => void;
}

export const opponent = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

/** 山札の上から1枚引く。引けなければ false */
export function draw(state: GameState, player: PlayerId, emit: (e: GameEvent) => void): boolean {
  const me = state.players[player];
  const cardId = me.deck.shift();
  if (!cardId) return false;
  me.hand.push(cardId);
  emit({ type: "drew", player, cardId });
  return true;
}

export function damageLeader(
  state: GameState,
  player: PlayerId,
  amount: number,
  emit: (e: GameEvent) => void,
) {
  const p = state.players[player];
  p.lp = Math.max(0, p.lp - amount);
  emit({ type: "leaderDamaged", player, amount, lp: p.lp });
}

/** キーワード能力。カード定義の keywords から自動で付く */
export const KEYWORD_ABILITIES: Record<string, Ability> = {
  拡散: {
    onPlay: ({ state, player, emit }) => {
      draw(state, player, emit);
    },
  },
  炎上: {
    onPlay: ({ state, player, emit }) => {
      damageLeader(state, opponent(player), 2000, emit);
      damageLeader(state, player, 2000, emit);
    },
  },
  祝福: {
    onPlay: ({ state, player, config, emit }) => {
      const p = state.players[player];
      const before = p.lp;
      p.lp = Math.min(config.startLp ?? DEFAULT_CONFIG.startLp, p.lp + 2000);
      emit({ type: "leaderHealed", player, amount: p.lp - before, lp: p.lp });
    },
  },
};

/** カードIDごとの固有効果。新しいカードの効果はここに足す */
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

/** そのカードが持つ能力（キーワード能力 → 固有効果の順） */
export function abilitiesOf(card: RuleCard): Ability[] {
  const list: Ability[] = [];
  for (const k of card.keywords ?? []) {
    const a = KEYWORD_ABILITIES[k];
    if (a) list.push(a);
  }
  const own = ABILITIES[card.id];
  if (own) list.push(own);
  return list;
}

export const hasKeyword = (card: RuleCard | undefined, k: string) => card?.keywords?.includes(k) ?? false;
