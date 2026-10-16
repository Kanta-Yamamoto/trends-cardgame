import { abilitiesOf, damageLeader, draw, hasKeyword, opponent } from "./abilities";
import { nextRandom } from "./rng";
import {
  type Action,
  type AttackTarget,
  type Config,
  DEFAULT_CONFIG,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerState,
  type RuleCard,
  RuleError,
  SLOTS,
  type Unit,
} from "./types";

export interface NewGameInput {
  decks: Record<PlayerId, readonly string[]>;
  seed?: number;
  first?: PlayerId;
  config?: Partial<Config>;
  /** false にすると山札を並び替えない（テスト用） */
  shuffle?: boolean;
}

function shuffled(deck: readonly string[], seed: number): [string[], number] {
  const d = [...deck];
  let s = seed;
  for (let i = d.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(s);
    s = next;
    const j = Math.floor(r * (i + 1));
    [d[i], d[j]] = [d[j] as string, d[i] as string];
  }
  return [d, s];
}

/** 新しい対戦を作る。山札をシャッフルし、上から startHand 枚を引いて始める */
export function createGame(input: NewGameInput): GameState {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  let seed = input.seed ?? 1;
  const first = input.first ?? "p1";
  const mk = (deck: readonly string[], isFirst: boolean): PlayerState => {
    let d = [...deck];
    if (input.shuffle !== false) [d, seed] = shuffled(deck, seed);
    // 後攻は1枚多く持って始める（先攻有利を和らげる）
    const hand = config.startHand + (isFirst ? 0 : config.secondExtra);
    return {
      lp: config.startLp,
      mana: isFirst ? 1 : 0,
      maxMana: isFirst ? 1 : 0,
      deck: d.slice(hand),
      hand: d.slice(0, hand),
      field: Array.from({ length: SLOTS }, () => null),
      trash: [],
    };
  };
  const p1 = mk(input.decks.p1, first === "p1");
  const p2 = mk(input.decks.p2, first === "p2");
  return { turn: 1, active: first, players: { p1, p2 }, winner: null, seed, nextUid: 1 };
}

/** 支払うコスト（効果による補正込み、最低0） */
export function effectiveCost(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Record<string, RuleCard>,
): number {
  const card = must(catalog, cardId);
  const mod = abilitiesOf(card).reduce(
    (sum, a) => sum + (a.costModifier?.({ state, player, catalog }) ?? 0),
    0,
  );
  return Math.max(0, card.cost + mod);
}

/** アイコンの残り体力 */
export function hpLeft(unit: Unit, catalog: Record<string, RuleCard>): number {
  return must(catalog, unit.cardId).hp - unit.damage;
}

/** 相手の場にガードがいるか（いる間はマスターを攻撃できない） */
export function isGuarded(state: GameState, player: PlayerId, catalog: Record<string, RuleCard>): boolean {
  return state.players[player].field.some((u) => u && hasKeyword(catalog[u.cardId], "ガード"));
}

/** 今攻撃できる相手。相手のアイコンはいつでも攻撃でき、マスターはガードがいない間だけ攻撃できる */
export function legalTargets(
  state: GameState,
  player: PlayerId,
  catalog: Record<string, RuleCard>,
): AttackTarget[] {
  const foeId = opponent(player);
  const units = state.players[foeId].field.flatMap((u, slot) => (u ? [{ kind: "unit" as const, slot }] : []));
  if (isGuarded(state, foeId, catalog)) return units;
  return [{ kind: "leader" as const }, ...units];
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
  const ctx = { state, player: action.player, catalog, config, emit };

  switch (action.type) {
    case "play": {
      const cardId = me.hand[action.handIndex];
      if (cardId === undefined) throw new RuleError("no_card", "そのカードは手札にありません");
      if (action.slot < 0 || action.slot >= SLOTS) throw new RuleError("bad_slot", "その場所には出せません");
      if (me.field[action.slot]) throw new RuleError("slot_taken", "その場所にはすでにカードがあります");
      const cost = effectiveCost(state, action.player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `話題力が足りません（必要 ${cost}・残り ${me.mana}）`);
      const card = must(catalog, cardId);
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      me.field[action.slot] = {
        uid: state.nextUid++,
        cardId,
        canAttack: hasKeyword(card, "速攻"),
        damage: 0,
      };
      emit({ type: "played", player: action.player, cardId, slot: action.slot, cost });
      for (const a of abilitiesOf(card)) a.onPlay?.(ctx);
      break;
    }
    case "attack": {
      const atk = me.field[action.from];
      if (!atk) throw new RuleError("no_unit", "攻撃するカードがありません");
      if (!atk.canAttack) throw new RuleError("cannot_attack", "このカードは今は攻撃できません");
      const legal = legalTargets(state, action.player, catalog);
      const ok = legal.some((t) =>
        t.kind === "leader"
          ? action.target.kind === "leader"
          : action.target.kind === "unit" && action.target.slot === t.slot,
      );
      if (!ok) {
        throw new RuleError(
          "guarded",
          action.target.kind === "unit"
            ? "攻撃先のアイコンがありません"
            : "相手の場にガードがいる間は、マスターを攻撃できません",
        );
      }
      atk.canAttack = false;
      const atkCard = must(catalog, atk.cardId);
      if (action.target.kind === "leader") {
        damageLeader(state, foeId, atkCard.attack, emit);
      } else {
        // お互いの攻撃力の分だけ、相手の体力を削る（ダメージは残る）
        const slot = action.target.slot;
        const def = foe.field[slot] as Unit;
        const defCard = must(catalog, def.cardId);
        def.damage += atkCard.attack;
        atk.damage += defCard.attack;
        const destroyed: string[] = [];
        if (def.damage >= defCard.hp) {
          foe.field[slot] = null;
          foe.trash.push(def.cardId);
          destroyed.push(def.cardId);
        }
        if (atk.damage >= atkCard.hp) {
          me.field[action.from] = null;
          me.trash.push(atk.cardId);
          destroyed.push(atk.cardId);
        }
        emit({
          type: "battle",
          attacker: atk.cardId,
          defender: def.cardId,
          toDefender: atkCard.attack,
          toAttacker: defCard.attack,
          destroyed,
        });
      }
      for (const a of abilitiesOf(atkCard)) a.onAttack?.(ctx);
      break;
    }
    case "endTurn": {
      state.active = foeId;
      state.turn += 1;
      foe.maxMana = Math.min(config.maxMana, foe.maxMana + 1);
      // 後攻の最初のターンだけ話題力 +1（先攻有利を和らげる）
      foe.mana = foe.maxMana + (state.turn === 2 ? config.secondBonusMana : 0);
      for (const u of foe.field) if (u) u.canAttack = true;
      emit({ type: "turnStarted", player: foeId, turn: state.turn, mana: foe.mana });
      if (!draw(state, foeId, emit)) {
        emit({ type: "deckOut", player: foeId });
        state.winner = action.player;
        emit({ type: "won", player: action.player });
      }
      break;
    }
  }
  // 炎上などで自分のライフが0になることもあるので、毎回両者を確認する
  if (!state.winner) {
    if (foe.lp <= 0) state.winner = action.player;
    else if (me.lp <= 0) state.winner = foeId;
    if (state.winner) emit({ type: "won", player: state.winner });
  }
  return { state, events };
}

function must(catalog: Record<string, RuleCard>, id: string): RuleCard {
  const c = catalog[id];
  if (!c) throw new RuleError("unknown_card", `未登録のカード: ${id}`);
  return c;
}
