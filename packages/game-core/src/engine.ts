import type { CardEffect, Keyword } from "@trends/cards";
import { nextRandom } from "./rng";
import {
  type Action,
  type AttackTarget,
  type CastTarget,
  CENTER_SLOT,
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
  type UnitView,
} from "./types";

export interface NewGameInput {
  decks: Record<PlayerId, readonly string[]>;
  seed?: number;
  first?: PlayerId;
  config?: Partial<Config>;
  /** false にすると山札を並び替えない（テスト用） */
  shuffle?: boolean;
}

type Emit = (e: GameEvent) => void;
type Catalog = Record<string, RuleCard>;

export const opponent = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

function must(catalog: Catalog, id: string): RuleCard {
  const c = catalog[id];
  if (!c) throw new RuleError("unknown_card", `未登録のカード: ${id}`);
  return c;
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

function random(state: GameState): number {
  const [r, seed] = nextRandom(state.seed);
  state.seed = seed;
  return r;
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
      playedThisTurn: 0,
      postsUsed: 0,
      heals: 0,
      extraTurns: 0,
      breakthroughTurn: 0,
      darkSpent: [],
    };
  };
  const p1 = mk(input.decks.p1, first === "p1");
  const p2 = mk(input.decks.p2, first === "p2");
  return { turn: 1, active: first, players: { p1, p2 }, winner: null, seed, nextUid: 1 };
}

/* ---------- アイコンの今の姿 ---------- */

function keywordsOf(u: Unit, catalog: Catalog): Keyword[] {
  if (u.silenced) return [];
  const card = must(catalog, u.cardId);
  const kw = u.dark && card.dark ? card.dark.keywords : card.keywords;
  return u.noGuard ? kw.filter((k) => k !== "ガード") : kw;
}

function effectsOf(u: Unit, catalog: Catalog): CardEffect[] {
  if (u.silenced) return [];
  const card = must(catalog, u.cardId);
  if (u.dark) return card.dark?.effects ?? [];
  return card.effects;
}

const triggerOf = (e: CardEffect) => e.on ?? "play";

/** 場にいる間ずっと効く効果を持っているか */
function hasPassive(u: Unit, kind: CardEffect["do"], catalog: Catalog): boolean {
  return effectsOf(u, catalog).some((e) => triggerOf(e) === "passive" && e.do === kind);
}

export function hasKeyword(u: Unit, k: Keyword, catalog: Catalog): boolean {
  return keywordsOf(u, catalog).includes(k);
}

/** アイコンの攻撃力・体力・キーワードなど、効果を反映した今の値 */
export function viewUnit(state: GameState, owner: PlayerId, unit: Unit, catalog: Catalog): UnitView {
  const card = must(catalog, unit.cardId);
  const base = unit.dark && card.dark ? card.dark : { attack: card.attack ?? 0, hp: card.hp ?? 1 };
  let attack = base.attack + unit.atkBuff;
  for (const e of effectsOf(unit, catalog)) {
    if (triggerOf(e) === "passive" && e.do === "attackPerAlly") {
      attack += state.players[owner].field.filter((x) => x && x.uid !== unit.uid).length;
    }
  }
  const maxHp = base.hp + unit.hpBuff;
  const keywords = keywordsOf(unit, catalog);
  return {
    unit,
    name: unit.dark ? card.dark?.name : undefined,
    attack: Math.max(0, attack),
    hp: maxHp - unit.damage,
    maxHp,
    keywords,
    guard: keywords.includes("ガード"),
    exposed: state.turn <= unit.exposedUntil,
    asleep: state.turn <= unit.boundUntil,
  };
}

/** 支払うコスト。手札にある間の補正（場のアイコンの数・使った投稿の数で安くなる）を反映する */
export function effectiveCost(state: GameState, player: PlayerId, cardId: string, catalog: Catalog): number {
  const card = must(catalog, cardId);
  const me = state.players[player];
  let cost = card.cost;
  for (const e of card.effects) {
    if (triggerOf(e) !== "hand") continue;
    if (e.do === "cheaperPerAlly") cost -= me.field.filter((u) => u).length;
    if (e.do === "cheaperPerPost") cost -= me.postsUsed ?? 0;
    if (e.do === "cheaperPerHeal") cost -= me.heals ?? 0;
  }
  return Math.max(0, cost);
}

/**
 * 闇堕ちの姿で出せるカード（オワコンにある、闇堕ちを持つカード。闇堕ちを使い終えたものは除く）。
 * 自分のターンなら、倒されたそのターンも含めていつでも出せる
 */
export function darkReady(state: GameState, player: PlayerId, catalog: Catalog): string[] {
  const me = state.players[player];
  const spent = new Map<string, number>();
  for (const id of me.darkSpent ?? []) spent.set(id, (spent.get(id) ?? 0) + 1);
  const ready: string[] = [];
  const counted = new Map<string, number>();
  for (const id of me.trash) {
    if (!catalog[id]?.dark) continue;
    const n = (counted.get(id) ?? 0) + 1;
    counted.set(id, n);
    if (n > (spent.get(id) ?? 0) && !ready.includes(id)) ready.push(id);
  }
  return ready;
}

/** 闇堕ちを今使えるか（自分のターンで、出せるカードと空いた枠がある） */
export function canDarkFall(state: GameState, player: PlayerId, catalog: Catalog): boolean {
  const me = state.players[player];
  return (
    state.active === player &&
    !state.winner &&
    me.field.some((u) => !u) &&
    darkReady(state, player, catalog).length > 0
  );
}

/**
 * 今攻撃できる相手。相手の場にガードがいる間は、ガードと晒し者しか攻撃できない（マスターも不可）。
 * ガードがいなければ、マスターと相手のアイコンすべて。
 */
export function legalTargets(state: GameState, player: PlayerId, catalog: Catalog): AttackTarget[] {
  const foeId = opponent(player);
  const units = state.players[foeId].field.flatMap((u, slot) =>
    u ? [{ slot, v: viewUnit(state, foeId, u, catalog) }] : [],
  );
  const through = state.players[player].breakthroughTurn === state.turn;
  if (!through && units.some((x) => x.v.guard)) {
    return units
      .filter((x) => x.v.guard || x.v.exposed)
      .map((x) => ({ kind: "unit" as const, slot: x.slot }));
  }
  return [{ kind: "leader" as const }, ...units.map((x) => ({ kind: "unit" as const, slot: x.slot }))];
}

/** そのアイコンが攻撃できる相手（今は全員 legalTargets と同じ。アイコンごとの制限を足すときの入口） */
export function attackTargets(
  state: GameState,
  player: PlayerId,
  _from: number,
  catalog: Catalog,
): AttackTarget[] {
  return legalTargets(state, player, catalog);
}

/** 攻撃したときの見込み（画面の予告用。実際の攻撃も同じ計算を使う） */
export interface AttackPreview {
  /** 攻撃先に与えるダメージ（叩きの +2 を含む） */
  toDefender: number;
  /** 反撃で受けるダメージ（マスターへの攻撃は 0） */
  toAttacker: number;
  /** 叩きで上がった分 */
  bonus: number;
  /** 攻撃先を倒せる（闇堕ちするアイコンは裏返る） */
  kills: boolean;
  /** 反撃で攻撃した側が倒れる */
  dies: boolean;
}

export function previewAttack(
  state: GameState,
  player: PlayerId,
  from: number,
  target: AttackTarget,
  catalog: Catalog,
): AttackPreview | null {
  const atk = state.players[player].field[from];
  if (!atk) return null;
  const av = viewUnit(state, player, atk, catalog);
  if (target.kind === "leader") {
    const lp = state.players[opponent(player)].lp;
    return { toDefender: av.attack, toAttacker: 0, bonus: 0, kills: av.attack >= lp, dies: false };
  }
  const foeId = opponent(player);
  const def = state.players[foeId].field[target.slot];
  if (!def) return null;
  const dv = viewUnit(state, foeId, def, catalog);
  const bonus = av.keywords.includes("叩き") && def.damage > 0 ? 2 : 0;
  const toDefender = av.attack + bonus;
  return {
    toDefender,
    toAttacker: dv.attack,
    bonus,
    kills: toDefender >= dv.hp,
    dies: dv.attack >= av.hp,
  };
}

/** 投稿を使える対象（対象を取らない投稿なら空） */
export function castTargets(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Catalog,
): CastTarget[] {
  const card = must(catalog, cardId);
  if (!card.target) return [];
  const side = card.target === "enemyIcon" ? "enemy" : "ally";
  const owner = side === "enemy" ? opponent(player) : player;
  return state.players[owner].field.flatMap((u, slot) => (u ? [{ side, slot } as CastTarget] : []));
}

/** そのアイコンが今攻撃できるか */
export function canUnitAttack(state: GameState, u: Unit): boolean {
  return u.canAttack && u.attacksLeft > 0 && state.turn > u.boundUntil;
}

/* ---------- 共通の処理 ---------- */

function draw(state: GameState, player: PlayerId, emit: Emit): boolean {
  const me = state.players[player];
  const cardId = me.deck.shift();
  if (!cardId) return false;
  me.hand.push(cardId);
  emit({ type: "drew", player, cardId });
  return true;
}

function damageLeader(state: GameState, player: PlayerId, amount: number, emit: Emit) {
  const p = state.players[player];
  p.lp = Math.max(0, p.lp - amount);
  emit({ type: "leaderDamaged", player, amount, lp: p.lp });
}

function healLeader(state: GameState, player: PlayerId, amount: number, config: Config, emit: Emit) {
  const p = state.players[player];
  const before = p.lp;
  p.lp = Math.min(config.startLp, p.lp + amount);
  if (p.lp > before) emit({ type: "leaderHealed", player, amount: p.lp - before, lp: p.lp });
}

function newUnit(state: GameState, cardId: string, catalog: Catalog, token: boolean): Unit {
  const card = must(catalog, cardId);
  const rush = card.keywords.includes("速攻");
  return {
    uid: state.nextUid++,
    cardId,
    damage: 0,
    canAttack: rush,
    attacksLeft: rush ? (card.keywords.includes("連撃") ? 2 : 1) : 0,
    atkBuff: 0,
    hpBuff: 0,
    dark: false,
    darkUsed: false,
    exposedUntil: 0,
    boundUntil: 0,
    silenced: false,
    noGuard: false,
    token,
  };
}

function summon(state: GameState, player: PlayerId, cardId: string, catalog: Catalog, emit: Emit): boolean {
  const field = state.players[player].field;
  const slot = field.findIndex((u) => !u);
  if (slot < 0) return false;
  field[slot] = newUnit(state, cardId, catalog, true);
  emit({ type: "summoned", player, cardId, slot });
  return true;
}

function damageUnit(state: GameState, owner: PlayerId, slot: number, amount: number, emit: Emit) {
  const u = state.players[owner].field[slot];
  if (!u || amount <= 0) return;
  u.damage += amount;
  emit({ type: "damaged", player: owner, slot, cardId: u.cardId, amount });
}

/**
 * 体力が 0 以下のアイコンを片付ける。倒されたカードの ID を返す。
 * 闇堕ちを使い終えたカード（闇堕ちの姿・TL浄化で戻った姿）は、オワコンに戻っても、もう闇堕ちできない。
 */
function resolveDeaths(state: GameState, catalog: Catalog, emit: Emit): string[] {
  const destroyed: string[] = [];
  for (const owner of ["p1", "p2"] as const) {
    const p = state.players[owner];
    p.field.forEach((u, slot) => {
      if (!u) return;
      if (viewUnit(state, owner, u, catalog).hp > 0) return;
      p.field[slot] = null;
      if (!u.token) p.trash.push(u.cardId);
      destroyed.push(u.cardId);
      emit({ type: "destroyed", player: owner, cardId: u.cardId });
      if (u.darkUsed && !u.token) p.darkSpent = [...(p.darkSpent ?? []), u.cardId];
    });
  }
  return destroyed;
}

function strongestEnemy(state: GameState, player: PlayerId, catalog: Catalog): number {
  const foeId = opponent(player);
  let best = -1;
  let bestAtk = -1;
  state.players[foeId].field.forEach((u, slot) => {
    if (!u) return;
    const a = viewUnit(state, foeId, u, catalog).attack;
    if (a > bestAtk) {
      best = slot;
      bestAtk = a;
    }
  });
  return best;
}

interface Ctx {
  state: GameState;
  player: PlayerId;
  catalog: Catalog;
  config: Config;
  emit: Emit;
  /** 効果を出したアイコンの枠（アイコンの効果のとき） */
  selfSlot?: number;
  /** 投稿の対象 */
  target?: CastTarget;
  /** このカードより前に、このターン出したカードの枚数 */
  playedBefore: number;
}

/** 効果を1つ実行する */
/**
 * 回復の効果を使ったあと（回復した量が0でも数える）：回数を数え、場の「回復するたびに」の効果を起こす。
 * 回復の効果を1つ使うごとに1回（アイコンが何体回復しても1回）
 */
function afterHeal(ctx: Ctx) {
  const { state, player, catalog, emit } = ctx;
  const me = state.players[player];
  me.heals = (me.heals ?? 0) + 1;
  me.field.forEach((u, slot) => {
    if (!u) return;
    for (const e of effectsOf(u, catalog)) {
      if (triggerOf(e) !== "passive") continue;
      if (e.do === "healGrow") {
        u.atkBuff += e.attack;
        u.hpBuff += e.hp;
        emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: e.hp });
      } else if (e.do === "healBurn") {
        damageLeader(state, opponent(player), e.amount, emit);
      }
    }
  });
}

function runEffect(e: CardEffect, ctx: Ctx) {
  const { state, player, catalog, config, emit } = ctx;
  const me = state.players[player];
  const foeId = opponent(player);
  const self = ctx.selfSlot !== undefined ? me.field[ctx.selfSlot] : null;
  const tgtOwner = ctx.target ? (ctx.target.side === "enemy" ? foeId : player) : null;
  const tgt = ctx.target && tgtOwner ? state.players[tgtOwner].field[ctx.target.slot] : null;
  const status = (owner: PlayerId, slot: number, u: Unit, s: "晒し" | "眠り" | "訂正" | "ガード消滅") =>
    emit({ type: "status", player: owner, slot, cardId: u.cardId, status: s });

  const cond = e.if;
  if (cond) {
    const n = me.field.filter((u) => u && must(catalog, u.cardId).attributes.includes(cond.allies)).length;
    if (n < cond.atLeast) return;
  }

  switch (e.do) {
    case "summon":
      for (let i = 0; i < e.count; i++) if (!summon(state, player, e.card, catalog, emit)) break;
      break;
    case "copySelf":
      if (self) summon(state, player, self.cardId, catalog, emit);
      break;
    case "fill":
      while (summon(state, player, e.card, catalog, emit)) {}
      break;
    case "buffSelfPerPlayed":
      if (self && ctx.playedBefore > 0 && ctx.selfSlot !== undefined) {
        self.atkBuff += e.attack * ctx.playedBefore;
        emit({
          type: "buffed",
          player,
          slot: ctx.selfSlot,
          cardId: self.cardId,
          attack: e.attack * ctx.playedBefore,
          hp: 0,
        });
      }
      break;
    case "buffSelf":
      if (self && ctx.selfSlot !== undefined) {
        self.atkBuff += e.attack;
        self.hpBuff += e.hp;
        emit({ type: "buffed", player, slot: ctx.selfSlot, cardId: self.cardId, attack: e.attack, hp: e.hp });
      }
      break;
    case "buffAllies":
      me.field.forEach((u, slot) => {
        if (!u || slot === ctx.selfSlot) return;
        u.atkBuff += e.attack;
        u.hpBuff += e.hp;
        emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: e.hp });
      });
      break;
    case "buffRandomAlly": {
      const others = me.field.flatMap((u, slot) => (u && slot !== ctx.selfSlot ? [slot] : []));
      if (others.length === 0) break;
      const slot = others[Math.floor(random(state) * others.length)] as number;
      const u = me.field[slot] as Unit;
      u.atkBuff += e.attack;
      u.hpBuff += e.hp;
      emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: e.hp });
      break;
    }
    case "buff":
      if (tgt && ctx.target) {
        tgt.atkBuff += e.attack;
        tgt.hpBuff += e.hp;
        emit({
          type: "buffed",
          player,
          slot: ctx.target.slot,
          cardId: tgt.cardId,
          attack: e.attack,
          hp: e.hp,
        });
      }
      break;
    case "heal":
      if (e.to === "master") healLeader(state, player, e.amount ?? 0, config, emit);
      else {
        me.field.forEach((u, slot) => {
          if (!u || u.damage <= 0) return;
          const amount = e.to === "allAlliesFull" ? u.damage : Math.min(u.damage, e.amount ?? 0);
          u.damage -= amount;
          emit({ type: "healed", player, slot, cardId: u.cardId, amount });
        });
        if (e.to === "allAlliesAndMaster") healLeader(state, player, e.amount ?? 0, config, emit);
      }
      afterHeal(ctx);
      break;
    case "draw":
      if (e.ifHandAtMost === undefined || me.hand.length <= e.ifHandAtMost) {
        for (let i = 0; i < e.count; i++) draw(state, player, emit);
      }
      break;
    case "removeEnemyGuards":
      state.players[foeId].field.forEach((u, slot) => {
        if (u && hasKeyword(u, "ガード", catalog)) {
          u.noGuard = true;
          status(foeId, slot, u, "ガード消滅");
        }
      });
      break;
    case "damage":
      if (e.to === "strongestEnemy") {
        const slot = strongestEnemy(state, player, catalog);
        if (slot >= 0) damageUnit(state, foeId, slot, e.amount, emit);
      } else if (e.to === "allEnemies") {
        state.players[foeId].field.forEach((u, slot) => {
          if (u) damageUnit(state, foeId, slot, e.amount, emit);
        });
      } else if (e.to === "enemyMaster") damageLeader(state, foeId, e.amount, emit);
      else if (tgt && tgtOwner && ctx.target) damageUnit(state, tgtOwner, ctx.target.slot, e.amount, emit);
      break;
    case "expose": {
      // 晒し者：強化（プラスの分）が消え、相手の次のターンが終わるまでガードを無視して攻撃される
      const expose = (owner: PlayerId, slot: number, u: Unit) => {
        u.exposedUntil = state.turn + 2;
        u.atkBuff = Math.min(0, u.atkBuff);
        u.hpBuff = Math.min(0, u.hpBuff);
        status(owner, slot, u, "晒し");
      };
      if (e.to === "strongestEnemy") {
        const slot = strongestEnemy(state, player, catalog);
        const u = slot >= 0 ? state.players[foeId].field[slot] : null;
        if (u) expose(foeId, slot, u);
      } else if (e.to === "allEnemies") {
        state.players[foeId].field.forEach((u, slot) => {
          if (u) expose(foeId, slot, u);
        });
      } else if (tgt && tgtOwner && ctx.target) expose(tgtOwner, ctx.target.slot, tgt);
      break;
    }
    case "bind": {
      // 相手の次のターンに攻撃できないようにする
      const sleep = (owner: PlayerId, slot: number, u: Unit) => {
        u.boundUntil = state.turn + 1;
        status(owner, slot, u, "眠り");
      };
      if (e.to === "strongestEnemy") {
        const slot = strongestEnemy(state, player, catalog);
        const u = slot >= 0 ? state.players[foeId].field[slot] : null;
        if (u) sleep(foeId, slot, u);
      } else if (e.to === "allEnemies") {
        state.players[foeId].field.forEach((u, slot) => {
          if (u) sleep(foeId, slot, u);
        });
      } else if (tgt && tgtOwner && ctx.target) sleep(tgtOwner, ctx.target.slot, tgt);
      break;
    }
    case "silence":
      if (e.to === "strongestEnemy") {
        const slot = strongestEnemy(state, player, catalog);
        const u = slot >= 0 ? state.players[foeId].field[slot] : null;
        if (u) {
          u.silenced = true;
          status(foeId, slot, u, "訂正");
        }
      } else if (tgt && tgtOwner && ctx.target) {
        tgt.silenced = true;
        status(tgtOwner, ctx.target.slot, tgt, "訂正");
      }
      break;
    case "steal": {
      const to = me.field.findIndex((u) => !u);
      if (to < 0) break;
      const foeField = state.players[foeId].field;
      let from = -1;
      let best = -1;
      foeField.forEach((u, slot) => {
        if (!u) return;
        const v = viewUnit(state, foeId, u, catalog);
        const score = v.attack * 100 + v.hp;
        if (v.attack <= e.maxAttack && score > best) {
          from = slot;
          best = score;
        }
      });
      const u = from >= 0 ? foeField[from] : null;
      if (!u) break;
      foeField[from] = null;
      // 奪ったターンは攻撃できない
      Object.assign(u, { canAttack: false, attacksLeft: 0 });
      me.field[to] = u;
      emit({ type: "stolen", player, from, slot: to, cardId: u.cardId });
      break;
    }
    case "burnPerAlly": {
      const n = me.field.filter((u) => u).length;
      if (n > 0) damageLeader(state, foeId, n * e.amount, emit);
      break;
    }
    case "breakthrough":
      me.breakthroughTurn = state.turn;
      break;
    case "sweep":
      state.players[foeId].field.forEach((u, slot) => {
        if (!u) return;
        const v = viewUnit(state, foeId, u, catalog);
        if (v.hp <= e.maxHp) damageUnit(state, foeId, slot, v.hp, emit);
      });
      break;
    case "extraTurn":
      me.extraTurns = (me.extraTurns ?? 0) + 1;
      emit({ type: "extraTurn", player });
      break;
    case "rally":
      me.field.forEach((u, slot) => {
        if (!u) return;
        if (!u.canAttack) {
          u.canAttack = true;
          u.attacksLeft = hasKeyword(u, "連撃", catalog) ? 2 : 1;
        }
        if (slot !== ctx.selfSlot && e.attack) {
          u.atkBuff += e.attack;
          emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: 0 });
        }
      });
      break;
    case "weaken":
      if (tgt) tgt.atkBuff -= e.attack;
      break;
    case "cleanse":
      for (const owner of ["p1", "p2"] as const) {
        state.players[owner].field.forEach((u, slot) => {
          if (!u) return;
          const wasDark = u.dark;
          Object.assign(u, {
            atkBuff: 0,
            hpBuff: 0,
            exposedUntil: 0,
            boundUntil: 0,
            silenced: false,
            noGuard: false,
          });
          if (wasDark) {
            // 元の姿に戻る（闇堕ちは1枚につき1回なので、もう一度は闇堕ちしない）
            Object.assign(u, { dark: false, damage: 0 });
            emit({ type: "restored", player: owner, slot, cardId: u.cardId });
          }
        });
      }
      break;
    case "attackPerAlly":
    case "extraAttackOnKill":
    case "focusAura":
    case "lullaby":
    case "cheaperPerAlly":
    case "cheaperPerPost":
      break; // 場にいる間・手札にある間ずっと効く（それぞれの場所で計算）
  }
}

/** ターンの始め：話題力の回復、攻撃の準備、注目、子守唄、ドロー */
function startTurn(state: GameState, pid: PlayerId, catalog: Catalog, config: Config, emit: Emit) {
  const p = state.players[pid];
  const other = opponent(pid);
  state.active = pid;
  state.turn += 1;
  p.maxMana = Math.min(config.maxMana, p.maxMana + 1);
  // 後攻の最初のターンだけ話題力 +1（先攻有利を和らげる）
  p.mana = p.maxMana + (state.turn === 2 ? config.secondBonusMana : 0);
  p.playedThisTurn = 0;
  emit({ type: "turnStarted", player: pid, turn: state.turn, mana: p.mana });
  const center = p.field[CENTER_SLOT];
  const aura = !!center && hasPassive(center, "focusAura", catalog);
  p.field.forEach((u, slot) => {
    if (!u) return;
    u.canAttack = true;
    u.attacksLeft = hasKeyword(u, "連撃", catalog) ? 2 : 1;
    // 注目：ターンの始めに攻撃力が伸びる（真ん中の枠なら多く）。センターのトップアイドルがいれば全員
    if (hasKeyword(u, "注目", catalog) || aura) {
      const n = slot === CENTER_SLOT ? 2 : 1;
      u.atkBuff += n;
      emit({ type: "buffed", player: pid, slot, cardId: u.cardId, attack: n, hp: 0 });
    }
  });
  // 子守唄：相手の場にいれば、攻撃力がいちばん高いアイコンがこのターン眠る
  if (state.players[other].field.some((u) => u && hasPassive(u, "lullaby", catalog))) {
    const slot = strongestEnemy(state, other, catalog);
    const u = slot >= 0 ? p.field[slot] : null;
    if (u) {
      u.boundUntil = Math.max(u.boundUntil, state.turn);
      emit({ type: "status", player: pid, slot, cardId: u.cardId, status: "眠り" });
    }
  }
  if (!draw(state, pid, emit)) {
    emit({ type: "deckOut", player: pid });
    state.winner = other;
    emit({ type: "won", player: other });
  }
}

function checkWinner(state: GameState, actor: PlayerId, emit: Emit) {
  if (state.winner) return;
  const foeId = opponent(actor);
  if (state.players[foeId].lp <= 0) state.winner = actor;
  else if (state.players[actor].lp <= 0) state.winner = foeId;
  if (state.winner) emit({ type: "won", player: state.winner });
}

/**
 * 1つの操作を適用する。元の state は変更せず、新しい state と出来事の列を返す。
 * 反則の操作は RuleError を投げる。
 */
export function applyAction(
  prev: GameState,
  action: Action,
  catalog: Catalog,
  config: Config = DEFAULT_CONFIG,
): { state: GameState; events: GameEvent[] } {
  const state: GameState = JSON.parse(JSON.stringify(prev));
  const events: GameEvent[] = [];
  const emit: Emit = (e) => events.push(e);

  if (state.winner) throw new RuleError("game_over", "対戦は終了しています");
  if (action.type === "resign") {
    state.winner = opponent(action.player);
    emit({ type: "resigned", player: action.player });
    emit({ type: "won", player: state.winner });
    return { state, events };
  }
  if (action.player !== state.active) throw new RuleError("not_your_turn", "相手のターンです");
  const player = action.player;
  const me = state.players[player];
  const foeId = opponent(player);
  const foe = state.players[foeId];

  switch (action.type) {
    case "play": {
      const cardId = me.hand[action.handIndex];
      if (cardId === undefined) throw new RuleError("no_card", "そのカードは手札にありません");
      const card = must(catalog, cardId);
      if (card.type !== "icon") throw new RuleError("not_icon", "投稿は場に出せません");
      if (action.slot < 0 || action.slot >= SLOTS) throw new RuleError("bad_slot", "その場所には出せません");
      if (me.field[action.slot]) throw new RuleError("slot_taken", "その場所にはすでにアイコンがいます");
      const cost = effectiveCost(state, player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `話題力が足りません（必要 ${cost}・残り ${me.mana}）`);
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      me.field[action.slot] = newUnit(state, cardId, catalog, false);
      const playedBefore = me.playedThisTurn++;
      emit({ type: "played", player, cardId, slot: action.slot, cost });
      const ctx: Ctx = { state, player, catalog, config, emit, selfSlot: action.slot, playedBefore };
      for (const e of card.effects) if (triggerOf(e) === "play") runEffect(e, ctx);
      resolveDeaths(state, catalog, emit);
      break;
    }
    case "darkFall": {
      const cardId = action.cardId;
      if (!darkReady(state, player, catalog).includes(cardId))
        throw new RuleError(
          "no_dark",
          "闇堕ちできるのは、オワコンにある闇堕ちを持つカードだけです（1枚につき1回）",
        );
      if (action.slot < 0 || action.slot >= SLOTS) throw new RuleError("bad_slot", "その場所には出せません");
      if (me.field[action.slot]) throw new RuleError("slot_taken", "その場所にはすでにアイコンがいます");
      const card = must(catalog, cardId);
      me.trash.splice(me.trash.lastIndexOf(cardId), 1);
      // 闇堕ちの姿は、出たターンには攻撃できない（速攻のように殴りかかることはしない）
      const u = Object.assign(newUnit(state, cardId, catalog, false), {
        dark: true,
        darkUsed: true,
        canAttack: false,
        attacksLeft: 0,
      });
      me.field[action.slot] = u;
      emit({ type: "darkFall", player, slot: action.slot, cardId });
      const ctx: Ctx = { state, player, catalog, config, emit, selfSlot: action.slot, playedBefore: 0 };
      for (const e of card.dark?.effects ?? []) if (triggerOf(e) === "play") runEffect(e, ctx);
      resolveDeaths(state, catalog, emit);
      break;
    }
    case "cast": {
      const cardId = me.hand[action.handIndex];
      if (cardId === undefined) throw new RuleError("no_card", "そのカードは手札にありません");
      const card = must(catalog, cardId);
      if (card.type !== "post") throw new RuleError("not_post", "アイコンは場に出して使います");
      const cost = effectiveCost(state, player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `話題力が足りません（必要 ${cost}・残り ${me.mana}）`);
      if (card.target) {
        const ok = castTargets(state, player, cardId, catalog).some(
          (t) => t.side === action.target?.side && t.slot === action.target?.slot,
        );
        if (!ok) throw new RuleError("bad_target", "その相手には使えません");
      }
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      me.trash.push(cardId);
      me.postsUsed = (me.postsUsed ?? 0) + 1;
      const playedBefore = me.playedThisTurn++;
      emit({ type: "cast", player, cardId, cost, target: action.target });
      const ctx: Ctx = { state, player, catalog, config, emit, target: action.target, playedBefore };
      for (const e of card.effects) if (triggerOf(e) === "play") runEffect(e, ctx);
      resolveDeaths(state, catalog, emit);
      break;
    }
    case "attack": {
      const atk = me.field[action.from];
      if (!atk) throw new RuleError("no_unit", "攻撃するアイコンがいません");
      if (state.turn <= atk.boundUntil)
        throw new RuleError("asleep", "このアイコンは眠っていて攻撃できません");
      if (!canUnitAttack(state, atk))
        throw new RuleError("cannot_attack", "このアイコンは今は攻撃できません");
      const legal = attackTargets(state, player, action.from, catalog);
      const t = action.target;
      if (
        !legal.some((x) =>
          x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot,
        )
      ) {
        throw new RuleError(
          "guarded",
          t.kind === "unit" && !foe.field[t.slot]
            ? "攻撃先のアイコンがいません"
            : "相手の場にガードがいる間は、ガード（と晒し者）しか攻撃できません",
        );
      }
      atk.attacksLeft -= 1;
      const av = viewUnit(state, player, atk, catalog);
      if (t.kind === "leader") {
        damageLeader(state, foeId, av.attack, emit);
      } else {
        // お互いの攻撃力の分だけ、相手の体力を削る（ダメージは残る）
        const def = foe.field[t.slot] as Unit;
        const { toDefender, toAttacker } = previewAttack(
          state,
          player,
          action.from,
          t,
          catalog,
        ) as AttackPreview;
        def.damage += toDefender;
        atk.damage += toAttacker;
        const attackerId = atk.cardId;
        const defenderId = def.cardId;
        // 闇堕ちや破壊の出来事は battle の後に出す
        const after: GameEvent[] = [];
        const destroyed = resolveDeaths(state, catalog, (e) => after.push(e));
        // 相手を倒したら、もう1回攻撃できる（倒した側が残っていれば）
        const left = foe.field[t.slot];
        const killed = !left || left.uid !== def.uid;
        const alive = me.field[action.from];
        if (killed && alive?.uid === atk.uid && hasPassive(alive, "extraAttackOnKill", catalog)) {
          alive.attacksLeft += 1;
        }
        emit({
          type: "battle",
          attacker: attackerId,
          defender: defenderId,
          toDefender,
          toAttacker,
          destroyed,
        });
        for (const e of after) emit(e);
      }
      break;
    }
    case "endTurn": {
      // ターンの終わりに働く効果
      me.field.forEach((u, slot) => {
        if (!u) return;
        for (const e of effectsOf(u, catalog)) {
          if (triggerOf(e) !== "turnEnd") continue;
          runEffect(e, { state, player, catalog, config, emit, selfSlot: slot, playedBefore: 0 });
        }
      });
      resolveDeaths(state, catalog, emit);
      // 追加のターンがあれば、相手に渡さずにもう一度自分のターン
      const next = (me.extraTurns ?? 0) > 0 ? player : foeId;
      if (next === player) me.extraTurns -= 1;
      startTurn(state, next, catalog, config, emit);
      break;
    }
  }
  checkWinner(state, player, emit);
  return { state, events };
}
