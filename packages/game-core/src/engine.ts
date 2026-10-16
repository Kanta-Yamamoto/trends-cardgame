import { ABILITIES, opponent } from "./abilities";
import {
  type Action,
  type Config,
  DEFAULT_CONFIG,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerState,
  type RuleCard,
  RuleError,
  SLOTS,
} from "./types";

export interface NewGameInput {
  decks: Record<PlayerId, string[]>;
  seed?: number;
  first?: PlayerId;
  config?: Partial<Config>;
}

/** 新しい対戦を作る。山札の上（配列の先頭）から startHand 枚を引いて始める */
export function createGame(input: NewGameInput): GameState {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  const mk = (deck: string[]): PlayerState => {
    const d = [...deck];
    return {
      lp: config.startLp,
      mana: config.maxMana,
      deck: d.slice(config.startHand),
      hand: d.slice(0, config.startHand),
      field: Array.from({ length: SLOTS }, () => null),
      trash: [],
    };
  };
  return {
    turn: 1,
    active: input.first ?? "p1",
    players: { p1: mk(input.decks.p1), p2: mk(input.decks.p2) },
    winner: null,
    seed: input.seed ?? 1,
    nextUid: 1,
  };
}

/** 支払うコスト（効果による補正込み、最低0） */
export function effectiveCost(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Record<string, RuleCard>,
): number {
  const card = must(catalog, cardId);
  const mod = ABILITIES[cardId]?.costModifier?.({ state, player, catalog }) ?? 0;
  return Math.max(0, card.cost + mod);
}

/**
 * 1つの操作を適用する。元の state は変更せず、新しい state と出来事の列を返す。
 * 反則の操作は RuleError を投げる。
 */
export function applyAction(
  prev: GameState,
  action: Action,
  catalog: Record<string, RuleCard>,
  config: Config = DEFAULT_CONFIG,
): { state: GameState; events: GameEvent[] } {
  const state: GameState = JSON.parse(JSON.stringify(prev));
  const events: GameEvent[] = [];
  const emit = (e: GameEvent) => events.push(e);

  if (state.winner) throw new RuleError("game_over", "対戦は終了しています");
  if (action.player !== state.active) throw new RuleError("not_your_turn", "相手のターンです");
  const me = state.players[action.player];
  const foeId = opponent(action.player);
  const foe = state.players[foeId];

  switch (action.type) {
    case "play": {
      const cardId = me.hand[action.handIndex];
      if (cardId === undefined) throw new RuleError("no_card", "そのカードは手札にありません");
      if (action.slot < 0 || action.slot >= SLOTS) throw new RuleError("bad_slot", "その場所には出せません");
      if (me.field[action.slot]) throw new RuleError("slot_taken", "その場所にはすでにカードがあります");
      const cost = effectiveCost(state, action.player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `話題力が足りません（必要 ${cost}・残り ${me.mana}）`);
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      const haste = must(catalog, cardId).keywords?.includes("速攻") ?? false;
      me.field[action.slot] = { uid: state.nextUid++, cardId, canAttack: haste };
      emit({ type: "played", player: action.player, cardId, slot: action.slot, cost });
      ABILITIES[cardId]?.onPlay?.({ state, player: action.player, catalog, emit });
      break;
    }
    case "attack": {
      const atk = me.field[action.from];
      if (!atk) throw new RuleError("no_unit", "攻撃するカードがありません");
      if (!atk.canAttack) throw new RuleError("cannot_attack", "このカードは今は攻撃できません");
      atk.canAttack = false;
      const atkCard = must(catalog, atk.cardId);
      if (action.target.kind === "leader") {
        foe.lp = Math.max(0, foe.lp - atkCard.power);
        emit({ type: "leaderDamaged", player: foeId, amount: atkCard.power, lp: foe.lp });
      } else {
        const slot = action.target.slot;
        const def = foe.field[slot];
        if (!def) throw new RuleError("no_target", "攻撃先のカードがありません");
        const defCard = must(catalog, def.cardId);
        const destroyed: string[] = [];
        if (atkCard.power >= defCard.power) {
          foe.field[slot] = null;
          foe.trash.push(def.cardId);
          destroyed.push(def.cardId);
        }
        if (defCard.power >= atkCard.power) {
          me.field[action.from] = null;
          me.trash.push(atk.cardId);
          destroyed.push(atk.cardId);
        }
        emit({ type: "battle", attacker: atk.cardId, defender: def.cardId, destroyed });
      }
      ABILITIES[atk.cardId]?.onAttack?.({ state, player: action.player, catalog, emit });
      if (foe.lp <= 0) {
        state.winner = action.player;
        emit({ type: "won", player: action.player });
      }
      break;
    }
    case "endTurn": {
      state.active = foeId;
      state.turn += 1;
      foe.mana = config.maxMana;
      for (const u of foe.field) if (u) u.canAttack = true;
      const drawn = foe.deck.shift();
      if (drawn) {
        foe.hand.push(drawn);
        emit({ type: "drew", player: foeId, cardId: drawn });
      }
      emit({ type: "turnStarted", player: foeId, turn: state.turn });
      break;
    }
  }
  return { state, events };
}

function must(catalog: Record<string, RuleCard>, id: string): RuleCard {
  const c = catalog[id];
  if (!c) throw new RuleError("unknown_card", `未登録のカード: ${id}`);
  return c;
}
