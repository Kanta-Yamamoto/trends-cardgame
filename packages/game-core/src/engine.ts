import type { CardEffect, Kaiwai, Keyword } from "@trends/cards";
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
  MAX_HAND,
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
    // 後攻は1枚多く持って始める（先攻 3 枚・後攻 4 枚。先攻有利を和らげる）
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
      darkOmens: [],
      buzzLeft: config.buzzCount,
      buzzFrom: Math.max(1, config.buzzFrom - (isFirst ? 0 : 1)),
      turnsTaken: isFirst ? 1 : 0,
    };
  };
  const p1 = mk(input.decks.p1, first === "p1");
  const p2 = mk(input.decks.p2, first === "p2");
  return { turn: 1, active: first, players: { p1, p2 }, winner: null, seed, nextUid: 1 };
}

/* ---------- キャラクターの今の姿 ---------- */

function keywordsOf(u: Unit, catalog: Catalog): Keyword[] {
  if (u.silenced) return [];
  const card = must(catalog, u.cardId);
  const base = u.dark && card.dark ? card.dark.keywords : card.keywords;
  const kw: Keyword[] = u.gainedGuard && !base.includes("ガード") ? [...base, "ガード"] : base;
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
export function hasPassive(u: Unit, kind: CardEffect["do"], catalog: Catalog): boolean {
  return effectsOf(u, catalog).some((e) => triggerOf(e) === "passive" && e.do === kind);
}

export function hasKeyword(u: Unit, k: Keyword, catalog: Catalog): boolean {
  return keywordsOf(u, catalog).includes(k);
}

/** その界隈に入っているか（闇堕ちの姿でも元のカードの界隈のまま） */
export function inKaiwai(u: Unit, k: Kaiwai, catalog: Catalog): boolean {
  return must(catalog, u.cardId).kaiwai.includes(k);
}

/** 自分の場のキャラクターの数（界隈で絞れる。except を渡すとそのキャラクターは数えない） */
function countAllies(
  state: GameState,
  owner: PlayerId,
  catalog: Catalog,
  kaiwai?: Kaiwai,
  except?: number,
): number {
  return state.players[owner].field.filter(
    (u) => u && u.uid !== except && (kaiwai === undefined || inKaiwai(u, kaiwai, catalog)),
  ).length;
}

/** キャラクターの攻撃力・体力・キーワードなど、効果を反映した今の値（持ち主は今は使わないが、呼び出し側の形はそのまま） */
export function viewUnit(state: GameState, _owner: PlayerId, unit: Unit, catalog: Catalog): UnitView {
  const card = must(catalog, unit.cardId);
  const base = unit.dark && card.dark ? card.dark : { attack: card.attack ?? 0, hp: card.hp ?? 1 };
  const attack = base.attack + unit.atkBuff + (unit.tempAtk ?? 0);
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
    exposed: !!unit.exposed,
    asleep: state.turn <= unit.boundUntil,
  };
}

/** 支払うコスト。手札にある間の補正（場のキャラクターの数・使った呪文の数で安くなる）を反映する */
export function effectiveCost(state: GameState, player: PlayerId, cardId: string, catalog: Catalog): number {
  const card = must(catalog, cardId);
  const me = state.players[player];
  let cost = card.cost;
  for (const e of card.effects) {
    if (triggerOf(e) !== "hand") continue;
    if (e.do === "cheaperPerAlly") cost -= countAllies(state, player, catalog, e.kaiwai);
    if (e.do === "cheaperPerPost") cost -= me.postsUsed ?? 0;
    if (e.do === "cheaperPerHeal") cost -= me.heals ?? 0;
    if (e.do === "cheaperPerGuard") cost -= me.guardsPlayed ?? 0;
  }
  cost -= me.handDiscount?.[cardId] ?? 0;
  return Math.max(0, cost);
}

/** 闇の気配（破壊されて、次の自分のターンの始めに闇堕ちして戻ってくるカード） */
export function darkOmens(state: GameState, player: PlayerId): { cardId: string; slot: number }[] {
  return state.players[player].darkOmens ?? [];
}

/** バズの残り回数 */
export function buzzLeft(state: GameState, player: PlayerId): number {
  return state.players[player].buzzLeft ?? 0;
}

/**
 * バズを今使えるか。使えないときは理由（画面の案内に出す）。
 * 1試合に2回・1ターンに1回・自分の4ターン目から（後攻は3ターン目から）
 */
export function buzzBlock(state: GameState, player: PlayerId): string | null {
  const me = state.players[player];
  if (state.winner) return "対戦は終了しています";
  if (state.active !== player) return "相手のターンです";
  if ((me.buzzLeft ?? 0) <= 0) return "バズはもう使い切りました";
  if (me.buzzTurn === state.turn) return "バズは1ターンに1回までです";
  const from = me.buzzFrom ?? 1;
  if ((me.turnsTaken ?? 0) < from) return `バズは自分の${from}ターン目から使えます`;
  if (!me.field.some((u) => u)) return "バズさせる自分のキャラクターがいません";
  return null;
}

/**
 * 今攻撃できる相手。相手の場にガードがいる間は、ガードしか攻撃できない（プレイヤーも不可）。
 * 晒し状態はガードを失うので、ガードとしては数えない。
 * ガードがいなければ、プレイヤーと相手のキャラクターすべて。
 */
export function legalTargets(state: GameState, player: PlayerId, catalog: Catalog): AttackTarget[] {
  const foeId = opponent(player);
  const units = state.players[foeId].field.flatMap((u, slot) =>
    u ? [{ slot, v: viewUnit(state, foeId, u, catalog) }] : [],
  );
  const through = state.players[player].breakthroughTurn === state.turn;
  if (!through && units.some((x) => x.v.guard)) {
    return units.filter((x) => x.v.guard).map((x) => ({ kind: "unit" as const, slot: x.slot }));
  }
  return [{ kind: "leader" as const }, ...units.map((x) => ({ kind: "unit" as const, slot: x.slot }))];
}

/** そのキャラクターが攻撃できる相手。突進（出たターン・闇堕ちした直後）のキャラクターは、相手のキャラクターにだけ攻撃できる */
export function attackTargets(
  state: GameState,
  player: PlayerId,
  from: number,
  catalog: Catalog,
): AttackTarget[] {
  const targets = legalTargets(state, player, catalog);
  const u = state.players[player].field[from];
  return u?.rushOnly ? targets.filter((t) => t.kind !== "leader") : targets;
}

/** 攻撃したときの見込み（画面の予告用。実際の攻撃も同じ計算を使う） */
export interface AttackPreview {
  /** 攻撃先に与えるダメージ */
  toDefender: number;
  /** 反撃で受けるダメージ（プレイヤーへの攻撃は 0） */
  toAttacker: number;
  /** 攻撃先を破壊できる（闇堕ちするキャラクターは裏返る） */
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
  // 突進で攻撃したときの強化は殴る前に働くので、上がった攻撃力で見積もる
  return previewRaw(withRushBoost(state, player, from, target, catalog).state, player, from, target, catalog);
}

/**
 * 突進で攻撃したとき（出たターンに相手のキャラクターへ）の効果を、殴る前に働かせた姿と、その出来事。
 * 働く効果がなければ、元の state をそのまま返す（画面の演出：強化を見せてから殴る）
 */
export function withRushBoost(
  state: GameState,
  player: PlayerId,
  from: number,
  target: AttackTarget,
  catalog: Catalog,
  config: Config = DEFAULT_CONFIG,
): { state: GameState; events: GameEvent[] } {
  const atk = state.players[player].field[from];
  if (!atk?.rushOnly || target.kind !== "unit") return { state, events: [] };
  if (!effectsOf(atk, catalog).some((e) => triggerOf(e) === "rush")) return { state, events: [] };
  const next: GameState = JSON.parse(JSON.stringify(state));
  const events: GameEvent[] = [];
  runRushEffects(next, player, from, target, catalog, config, (e) => events.push(e));
  return { state: next, events };
}

function runRushEffects(
  state: GameState,
  player: PlayerId,
  from: number,
  target: AttackTarget,
  catalog: Catalog,
  config: Config,
  emit: Emit,
) {
  const atk = state.players[player].field[from];
  if (!atk?.rushOnly || target.kind !== "unit") return;
  for (const e of effectsOf(atk, catalog)) {
    if (triggerOf(e) !== "rush") continue;
    runEffect(e, { state, player, catalog, config, emit, selfSlot: from, playedBefore: 0 });
  }
}

/** 今の姿のまま殴ったときの見積もり（突進の強化はもう働いた前提） */
function previewRaw(
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
    const foe = state.players[opponent(player)];
    if (isShielded(state, opponent(player)))
      return { toDefender: 0, toAttacker: 0, kills: false, dies: false };
    // 盾：1回ごとに減らす
    const cut = state.turn <= (foe.cutUntil ?? 0) ? (foe.cutAmount ?? 0) : 0;
    const dmg = Math.max(0, av.attack - cut);
    return { toDefender: dmg, toAttacker: 0, kills: dmg >= foe.lp, dies: false };
  }
  const foeId = opponent(player);
  const def = state.players[foeId].field[target.slot];
  if (!def) return null;
  const dv = viewUnit(state, foeId, def, catalog);
  // 攻撃されたときに受けるダメージを減らす（ベテラン解説者）
  const armor = effectsOf(def, catalog).reduce(
    (n, e) => (e.do === "armor" && triggerOf(e) === "passive" ? n + e.amount : n),
    0,
  );
  const toDefender = Math.max(0, av.attack - armor);
  return {
    toDefender,
    toAttacker: dv.attack,
    kills: toDefender >= dv.hp,
    dies: dv.attack >= av.hp,
  };
}

/** 呪文を使える対象（対象を取らない呪文なら空） */
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
  const k = side === "ally" ? card.targetKaiwai : undefined;
  const f = card.targetFilter;
  return state.players[owner].field.flatMap((u, slot) => {
    if (!u) return [];
    if (k !== undefined && !inKaiwai(u, k, catalog)) return [];
    if (f?.damaged && u.damage <= 0) return [];
    if (f?.maxAttack !== undefined && viewUnit(state, owner, u, catalog).attack > f.maxAttack) return [];
    return [{ side, slot } as CastTarget];
  });
}

/** そのキャラクターが今攻撃できるか */
export function canUnitAttack(state: GameState, u: Unit): boolean {
  return u.canAttack && u.attacksLeft > 0 && state.turn > u.boundUntil;
}

/* ---------- 共通の処理 ---------- */

function draw(state: GameState, player: PlayerId, emit: Emit): boolean {
  const me = state.players[player];
  const cardId = me.deck.shift();
  if (!cardId) return false;
  // 手札が上限なら、引いたカードはそのまま墓地へ
  if (me.hand.length >= MAX_HAND) {
    me.trash.push(cardId);
    emit({ type: "burned", player, cardId });
    return true;
  }
  me.hand.push(cardId);
  emit({ type: "drew", player, cardId });
  return true;
}

/** このプレイヤーに付いている「次の自分のターンの終わりにダメージを受ける」効果の合計 */
export function delayedDamageOn(state: GameState, player: PlayerId): number {
  return (state.players[player].delayedDamage ?? []).reduce((n, d) => n + d.amount, 0);
}

/** プレイヤーが守られていて、ダメージを受けないか */
export function isShielded(state: GameState, player: PlayerId): boolean {
  return state.turn <= (state.players[player].shieldUntil ?? 0);
}

/** 盾：プレイヤーが受けるダメージを1回ごとに減らす数（効いていなければ 0） */
export function damageCutOn(state: GameState, player: PlayerId): number {
  const p = state.players[player];
  return state.turn <= (p.cutUntil ?? 0) ? (p.cutAmount ?? 0) : 0;
}

function damageLeader(state: GameState, player: PlayerId, amount: number, emit: Emit) {
  const p = state.players[player];
  if (amount <= 0) return;
  if (isShielded(state, player)) {
    emit({ type: "shield", player, kind: "blocked", amount });
    return;
  }
  // 盾：1回ごとに決まった数だけ減らす
  if (damageCutOn(state, player) > 0) {
    const cut = Math.min(amount, p.cutAmount ?? 0);
    emit({ type: "shield", player, kind: "blocked", amount: cut });
    amount -= cut;
    if (amount <= 0) return;
  }
  p.lp = Math.max(0, p.lp - amount);
  emit({ type: "leaderDamaged", player, amount, lp: p.lp });
}

function healLeader(state: GameState, player: PlayerId, amount: number, config: Config, emit: Emit) {
  const p = state.players[player];
  const before = p.lp;
  p.lp = Math.min(config.startLp, p.lp + amount);
  if (p.lp > before) emit({ type: "leaderHealed", player, amount: p.lp - before, lp: p.lp });
}

/**
 * 晒し状態にする：ガードを失い、それまでの強化（プラスの分）がすべて消える。ずっと続く（TL浄化で消える）。
 * 晒されたあとに受けた強化は消えない
 */
function exposeUnit(owner: PlayerId, slot: number, u: Unit, emit: Emit) {
  u.exposed = true;
  u.exposeAtTurnEnd = false;
  u.noGuard = true;
  u.atkBuff = Math.min(0, u.atkBuff);
  u.tempAtk = 0;
  u.hpBuff = Math.min(0, u.hpBuff);
  emit({ type: "status", player: owner, slot, cardId: u.cardId, status: "晒し" });
}

/** 差し出し待ちのとき、その人が選べる自分のキャラクターの枠（効果を出したキャラクターは選べない） */
export function sacrificeCandidates(state: GameState, player: PlayerId): number[] {
  const p = state.pending;
  if (p?.kind !== "sacrifice") return [];
  return state.players[player].field.flatMap((u, slot) => (u && u.uid !== p.sourceUid ? [slot] : []));
}

/**
 * 今のフィールド（画面の背景）。闇堕ちの姿が場にいれば「闇」（持ち主は、いれば手番の人を先に）。
 * いなくても闇の気配があれば「予兆」
 */
export function fieldOf(
  state: GameState,
  _catalog?: Catalog,
): { kind: "dark" | "omen"; owner: PlayerId } | null {
  const order = [state.active, opponent(state.active)] as const;
  for (const owner of order)
    if (state.players[owner].field.some((u) => u?.dark)) return { kind: "dark", owner };
  for (const owner of order)
    if ((state.players[owner].darkOmens ?? []).length > 0) return { kind: "omen", owner };
  return null;
}

function newUnit(state: GameState, cardId: string, catalog: Catalog, token: boolean): Unit {
  const card = must(catalog, cardId);
  const rush = card.keywords.includes("速攻");
  // 突進：出たターンは相手のキャラクターにだけ攻撃できる（速攻があれば速攻が優先）
  const totsu = !rush && card.keywords.includes("突進");
  return {
    uid: state.nextUid++,
    cardId,
    damage: 0,
    canAttack: rush || totsu,
    attacksLeft: rush || totsu ? (card.keywords.includes("連撃") ? 2 : 1) : 0,
    rushOnly: totsu,
    atkBuff: 0,
    hpBuff: 0,
    dark: false,
    darkUsed: false,
    exposed: false,
    boundUntil: 0,
    silenced: false,
    noGuard: false,
    token,
  };
}

/** 効果でキャラクターを出す。出した枠を返す（出せなければ -1） */
function summon(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Catalog,
  emit: Emit,
  near?: number,
): number {
  const field = state.players[player].field;
  // 両隣を先に（左、右の順）。どちらも埋まっていれば、左から空いた枠へ
  const flank =
    near === undefined ? [] : [near - 1, near + 1].filter((s) => s >= 0 && s < field.length && !field[s]);
  const slot = flank[0] ?? field.findIndex((u) => !u);
  if (slot < 0) return -1;
  placeSummoned(state, player, cardId, catalog, emit, slot);
  return slot;
}

/** 空いている枠 slot に、効果で出したキャラクターを置く */
function placeSummoned(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Catalog,
  emit: Emit,
  slot: number,
) {
  const u = newUnit(state, cardId, catalog, true);
  state.players[player].field[slot] = u;
  // 出たときにガードを得るか（リスナー）。ほかの【場に出たとき】は、効果で出たトークンでは働かない
  for (const e of must(catalog, cardId).effects)
    if (e.do === "guardIfKaiwai" && triggerOf(e) === "play") grantGuardIfKaiwai(state, u, e.kaiwai, catalog);
  countGuard(state, player, u, catalog);
  emit({ type: "summoned", player, cardId, slot });
}

/** 手札のコストを下げていた分は、そのカードを出す・使うと消える */
function useDiscount(me: PlayerState, cardId: string) {
  if (!me.handDiscount?.[cardId]) return;
  const { [cardId]: _, ...rest } = me.handDiscount;
  me.handDiscount = rest;
}

/** 出したキャラクターがガードなら数える（ネ申のコスト。リスナーのように、出たときにガードを得たものも数える） */
function countGuard(state: GameState, player: PlayerId, u: Unit | null, catalog: Catalog) {
  if (!u || !hasKeyword(u, "ガード", catalog)) return;
  const p = state.players[player];
  p.guardsPlayed = (p.guardsPlayed ?? 0) + 1;
}

/** 場（自分と相手）にその界隈がいれば、ガードを得る（リスナー。出たときに一度だけ決まる） */
function grantGuardIfKaiwai(state: GameState, u: Unit, kaiwai: Kaiwai, catalog: Catalog) {
  const any = (["p1", "p2"] as const).some((pid) =>
    state.players[pid].field.some((o) => o && o.uid !== u.uid && inKaiwai(o, kaiwai, catalog)),
  );
  if (any) u.gainedGuard = true;
}

function damageUnit(state: GameState, owner: PlayerId, slot: number, amount: number, emit: Emit) {
  const u = state.players[owner].field[slot];
  if (!u || amount <= 0) return;
  u.damage += amount;
  emit({ type: "damaged", player: owner, slot, cardId: u.cardId, amount });
}

/**
 * 体力が 0 以下のキャラクターを片付ける。破壊されたカードの ID を返す。
 * 闇堕ちを使い終えたカード（闇堕ちの姿・TL浄化で戻った姿）は、墓地に戻っても、もう闇堕ちできない。
 */
function resolveDeaths(
  state: GameState,
  catalog: Catalog,
  emit: Emit,
  config: Config = DEFAULT_CONFIG,
): string[] {
  const destroyed: string[] = [];
  // 「破壊されたとき」の効果で、さらに倒れることがある。落ち着くまで繰り返す
  for (let round = 0; round < 10; round++) {
    const deaths: { owner: PlayerId; effects: CardEffect[] }[] = [];
    // この回で破壊されたトークンの数（持ち主・カード ID ごと。クサハミの「破壊されるたび」に使う）
    const lost: Record<PlayerId, Record<string, number>> = { p1: {}, p2: {} };
    let removed = false;
    for (const owner of ["p1", "p2"] as const) {
      const p = state.players[owner];
      p.field.forEach((u, slot) => {
        if (!u) return;
        if (viewUnit(state, owner, u, catalog).hp > 0) return;
        removed = true;
        const onDeath = effectsOf(u, catalog).filter((e) => triggerOf(e) === "death");
        p.field[slot] = null;
        // 闇堕ちの姿が破壊されたら、そのカードは消える（墓地にも行かない）。トークンはふつうのカードと同じく墓地へ
        const vanished = u.dark && !u.token;
        if (!vanished) p.trash.push(u.cardId);
        if (u.token) {
          p.tokensLost = { ...p.tokensLost, [u.cardId]: (p.tokensLost?.[u.cardId] ?? 0) + 1 };
          lost[owner][u.cardId] = (lost[owner][u.cardId] ?? 0) + 1;
        }
        destroyed.push(u.cardId);
        emit(
          vanished
            ? { type: "destroyed", player: owner, cardId: u.cardId, slot, vanished: true }
            : { type: "destroyed", player: owner, cardId: u.cardId, slot },
        );
        // 闇堕ちを持つカードが元の姿で破壊されたら、闇の気配（次の自分のターンの始めに闇堕ちして戻る）
        if (!u.token && !u.dark && catalog[u.cardId]?.dark) {
          const spent = (p.darkSpent ?? []).indexOf(u.cardId);
          if (u.darkUsed || spent >= 0) {
            // TL浄化で戻った姿や、闇堕ちの姿のまま手札に戻されたカードは、もう闇堕ちしない
            if (!u.darkUsed && spent >= 0) p.darkSpent = p.darkSpent.filter((_, i) => i !== spent);
          } else {
            p.darkOmens = [...(p.darkOmens ?? []), { cardId: u.cardId, slot }];
            emit({ type: "darkOmen", player: owner, slot, cardId: u.cardId });
          }
        }
        if (onDeath.length) deaths.push({ owner, effects: onDeath });
      });
    }
    if (!removed) break;
    // 自分のトークンが破壊されるたび、攻撃力+1（クサハミ）。同時に破壊された分はまとめて1回の強化にする
    for (const owner of ["p1", "p2"] as const) {
      state.players[owner].field.forEach((u, slot) => {
        if (!u) return;
        let n = 0;
        for (const e of effectsOf(u, catalog))
          if (e.do === "growOnTokenLost" && triggerOf(e) === "passive") n += lost[owner][e.card] ?? 0;
        if (n === 0) return;
        u.atkBuff += n;
        emit({ type: "buffed", player: owner, slot, cardId: u.cardId, attack: n, hp: 0, cause: "tokenLost" });
      });
    }
    for (const d of deaths)
      for (const e of d.effects)
        runEffect(e, { state, player: d.owner, catalog, config, emit, playedBefore: 0 });
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
  /** 効果を出したキャラクターの枠（キャラクターの効果のとき） */
  selfSlot?: number;
  /** 呪文の対象 */
  target?: CastTarget;
  /** このカードより前に、このターン出したカードの枚数 */
  playedBefore: number;
}

/** 効果を1つ実行する */
/**
 * 回復の効果を使ったあと（回復した量が0でも数える）：回数を数え、場の「回復するたびに」の効果を起こす。
 * 回復の効果を1つ使うごとに1回（キャラクターが何体回復しても1回）
 */
/** キャラクターを持ち主の手札に戻す。トークンも手札に入る（0コストで出し直せる） */
function bounceUnit(state: GameState, owner: PlayerId, slot: number, emit: Emit) {
  const p = state.players[owner];
  const u = p.field[slot];
  if (!u) return;
  p.field[slot] = null;
  p.hand.push(u.cardId);
  // 闇堕ちの姿（やTL浄化で戻った姿）が手札に戻ったら、そのカードの闇堕ちは使い終わり
  if (u.darkUsed && !u.token) p.darkSpent = [...(p.darkSpent ?? []), u.cardId];
  emit({ type: "bounced", player: owner, slot, cardId: u.cardId });
}

/** コストがいちばん高い相手のキャラクター（同じなら攻撃力が高い方）の枠。いなければ -1 */
function costliestEnemy(state: GameState, player: PlayerId, catalog: Catalog): number {
  const foeId = opponent(player);
  let slot = -1;
  let best = -1;
  state.players[foeId].field.forEach((u, s) => {
    if (!u) return;
    const score = must(catalog, u.cardId).cost * 100 + viewUnit(state, foeId, u, catalog).attack;
    if (score > best) {
      best = score;
      slot = s;
    }
  });
  return slot;
}

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
      } else if (e.do === "healStrike") {
        const at = strongestEnemy(state, player, catalog);
        if (at >= 0) damageUnit(state, opponent(player), at, e.amount, emit);
      } else if (e.do === "healBounce") {
        const at = costliestEnemy(state, player, catalog);
        if (at >= 0) bounceUnit(state, opponent(player), at, emit);
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
  const status = (owner: PlayerId, slot: number, u: Unit, s: "晒し" | "眠り" | "沈黙" | "ガード消滅") =>
    emit({ type: "status", player: owner, slot, cardId: u.cardId, status: s });

  const cond = e.if;
  if (cond) {
    if ("center" in cond) {
      if (ctx.selfSlot !== CENTER_SLOT) return;
    } else {
      const n =
        "kaiwai" in cond
          ? countAllies(state, player, catalog, cond.kaiwai)
          : me.field.filter((u) => u && must(catalog, u.cardId).attributes.includes(cond.allies)).length;
      if (n < cond.atLeast) return;
    }
  }

  switch (e.do) {
    case "summon": {
      const placed: number[] = [];
      const n = e.centerCount !== undefined && ctx.selfSlot === CENTER_SLOT ? e.centerCount : e.count;
      // flank なら隣を先に埋める。隣が埋まっていても数は減らさず、空いた枠へ出す（場が埋まれば止まる）
      const near = e.flank ? ctx.selfSlot : undefined;
      for (let i = 0; i < n; i++) {
        const s = summon(state, player, e.card, catalog, emit, near);
        if (s < 0) break;
        placed.push(s);
      }
      // 出したキャラクターに強化
      if (e.buff)
        for (const s of placed) {
          const u = me.field[s];
          if (!u) continue;
          u.atkBuff += e.buff.attack;
          u.hpBuff += e.buff.hp;
          emit({ type: "buffed", player, slot: s, cardId: u.cardId, attack: e.buff.attack, hp: e.buff.hp });
        }
      break;
    }
    case "copySelf":
      if (self) summon(state, player, self.cardId, catalog, emit);
      break;
    case "fill":
      while (summon(state, player, e.card, catalog, emit) >= 0) {}
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
    case "attackPerAlly": {
      // 出たときに数えて強化する。強化は晒し状態と TL浄化でしか消えないので、あとで仲間が減っても下がらない
      if (!self || ctx.selfSlot === undefined) break;
      const n = countAllies(state, player, catalog, e.kaiwai, self.uid);
      if (n > 0) {
        self.atkBuff += n;
        emit({ type: "buffed", player, slot: ctx.selfSlot, cardId: self.cardId, attack: n, hp: 0 });
      }
      break;
    }
    case "attackPerLostToken": {
      // 出たとき（闇堕ちしたとき）に、それまでに破壊された数を数えて強化する。あとから変わらない
      const n = me.tokensLost?.[e.card] ?? 0;
      if (n > 0 && self && ctx.selfSlot !== undefined) {
        self.atkBuff += n;
        emit({ type: "buffed", player, slot: ctx.selfSlot, cardId: self.cardId, attack: n, hp: 0 });
      }
      break;
    }
    case "growPerPlayed": {
      const n = e.cards.reduce((sum, id) => sum + (me.played?.[id] ?? 0), 0);
      if (n > 0 && self && ctx.selfSlot !== undefined) {
        self.atkBuff += e.attack * n;
        self.hpBuff += e.hp * n;
        emit({
          type: "buffed",
          player,
          slot: ctx.selfSlot,
          cardId: self.cardId,
          attack: e.attack * n,
          hp: e.hp * n,
        });
      }
      break;
    }
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
        if (e.kaiwai && !inKaiwai(u, e.kaiwai, catalog)) return;
        if (e.cards && !e.cards.includes(u.cardId)) return;
        if (e.thisTurn) u.tempAtk = (u.tempAtk ?? 0) + e.attack;
        else u.atkBuff += e.attack;
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
    case "healPerCard": {
      const n = me.field.filter((u) => u?.cardId === e.card).length;
      if (n === 0) break;
      healLeader(state, player, n, config, emit);
      afterHeal(ctx);
      break;
    }
    case "guardIfKaiwai":
      if (self) grantGuardIfKaiwai(state, self, e.kaiwai, catalog);
      break;
    case "draw":
      if (e.ifHandAtMost === undefined || me.hand.length <= e.ifHandAtMost) {
        for (let i = 0; i < e.count; i++) draw(state, player, emit);
      }
      break;
    case "tutor":
      for (let i = 0; i < e.count; i++) {
        const at = me.deck.findIndex((id) => {
          const c = must(catalog, id);
          if (e.kaiwai) return c.kaiwai.includes(e.kaiwai);
          return (
            c.type === "icon" &&
            (!e.guard || c.keywords.includes("ガード")) &&
            (!e.attribute || c.attributes.includes(e.attribute))
          );
        });
        if (at < 0) {
          draw(state, player, emit);
          continue;
        }
        const [cardId] = me.deck.splice(at, 1);
        if (cardId === undefined) break;
        me.hand.push(cardId);
        emit({ type: "drew", player, cardId });
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
    case "hype": {
      // 炎上商法：呪文なら対象の自分のキャラクター、キャラクターの効果なら自分
      const slot = ctx.target ? ctx.target.slot : ctx.selfSlot;
      const u = ctx.target ? tgt : self;
      if (u && slot !== undefined) {
        u.tempAtk = (u.tempAtk ?? 0) + e.attack;
        u.exposeAtTurnEnd = true;
        emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: 0 });
      }
      break;
    }
    case "sacrifice": {
      // 差し出し：選べるキャラクターがいる側だけ、選ぶ番になる（自分はこのキャラクター以外から）
      if (!self) break;
      const pend = {
        kind: "sacrifice" as const,
        source: player,
        sourceUid: self.uid,
        waiting: [],
        picks: {},
      };
      const waiting = (["p1", "p2"] as const).filter(
        (pid) => sacrificeCandidates({ ...state, pending: pend }, pid).length > 0,
      );
      if (waiting.length === 0) break;
      state.pending = { ...pend, waiting };
      emit({ type: "sacrificeAsk", player, waiting });
      break;
    }
    case "stageAces": {
      // 演出：両方に空き枠があるときだけ（公平に）、それぞれの山札から闇堕ちを持つカードを1枚ずつ出す。
      // 闇堕ち持ちは種類を問わず2枚まで入れられるので、山札の中からランダムに選ぶ。
      // 舞台に上げるだけなので、場に出たときの効果は働かない。出したキャラクターには突進を付ける
      // （相手側にも付くが、攻撃は自分のターンにしかできず、相手のターンの始めに突進は外れるので、相手が得をすることはない）
      const sides = [player, foeId] as const;
      if (sides.some((pid) => !state.players[pid].field.some((u) => !u))) break;
      for (const pid of sides) {
        const p = state.players[pid];
        const found = p.deck.flatMap((id, i) => (catalog[id]?.dark ? [i] : []));
        if (found.length === 0) continue;
        const at = found[Math.floor(random(state) * found.length)] as number;
        const [cardId] = p.deck.splice(at, 1);
        const slot = p.field.findIndex((u) => !u);
        if (cardId === undefined || slot < 0) continue;
        const u = newUnit(state, cardId, catalog, false);
        if (!u.canAttack) {
          u.canAttack = true;
          u.attacksLeft = hasKeyword(u, "連撃", catalog) ? 2 : 1;
          u.rushOnly = true;
        }
        p.field[slot] = u;
        emit({ type: "summoned", player: pid, cardId, slot });
      }
      break;
    }
    case "judge": {
      // 調停：敵味方を区別せず、攻撃力がいちばん高いキャラクターすべてを破壊する（このキャラクターは除く）
      const sides = [player, foeId] as const;
      let top = -1;
      for (const pid of sides)
        state.players[pid].field.forEach((u, slot) => {
          if (!u || (pid === player && slot === ctx.selfSlot)) return;
          top = Math.max(top, viewUnit(state, pid, u, catalog).attack);
        });
      if (top < 0) break;
      for (const pid of sides)
        state.players[pid].field.forEach((u, slot) => {
          if (!u || (pid === player && slot === ctx.selfSlot)) return;
          const v = viewUnit(state, pid, u, catalog);
          if (v.attack === top) damageUnit(state, pid, slot, Math.max(1, v.hp), emit);
        });
      break;
    }
    case "damagePerEnemy": {
      // 相手の場が賑わっているほど大きく燃える。数えるのは効果が働いた瞬間
      const foeField = state.players[foeId].field;
      const amount = foeField.filter((u) => u).length * e.per;
      foeField.forEach((u, slot) => {
        if (u) damageUnit(state, foeId, slot, amount, emit);
      });
      break;
    }
    case "expose": {
      const expose = (owner: PlayerId, slot: number, u: Unit) => exposeUnit(owner, slot, u, emit);
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
          status(foeId, slot, u, "沈黙");
        }
      } else if (tgt && tgtOwner && ctx.target) {
        tgt.silenced = true;
        status(tgtOwner, ctx.target.slot, tgt, "沈黙");
      }
      break;
    case "steal": {
      const to = me.field.findIndex((u) => !u);
      if (to < 0) break;
      const foeField = state.players[foeId].field;
      let from = -1;
      let best = -1;
      if (ctx.target?.side === "enemy") from = ctx.target.slot;
      else
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
      Object.assign(u, { canAttack: false, attacksLeft: 0, rushOnly: false });
      me.field[to] = u;
      emit({ type: "stolen", player, from, slot: to, cardId: u.cardId });
      break;
    }
    case "revive": {
      const slot = me.field.findIndex((u) => !u);
      if (slot < 0) break;
      // 墓地の中で、コストが maxCost 以下のキャラクターのうち、いちばんコストが高いもの（同じなら、あとに破壊されたもの）
      let at = -1;
      let best = -1;
      me.trash.forEach((id, i) => {
        const c = catalog[id];
        if (c?.type !== "icon" || c.cost > e.maxCost) return;
        if (c.cost >= best) {
          best = c.cost;
          at = i;
        }
      });
      const cardId = at >= 0 ? me.trash[at] : undefined;
      if (cardId === undefined) break;
      me.trash.splice(at, 1);
      me.field[slot] = newUnit(state, cardId, catalog, false);
      emit({ type: "revived", player, cardId, slot });
      // 戻ったカードの「場に出たとき」も働く（ハムスターの回復など）
      const sub: Ctx = { ...ctx, selfSlot: slot, target: undefined, playedBefore: me.playedThisTurn };
      for (const fx of must(catalog, cardId).effects) if (triggerOf(fx) === "play") runEffect(fx, sub);
      break;
    }
    case "burnPerAlly": {
      const n = countAllies(state, player, catalog, e.kaiwai);
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
    case "destroy": {
      // to が無ければ呪文の対象（相手のキャラクター）
      const slot =
        e.to === "strongestEnemy"
          ? strongestEnemy(state, player, catalog)
          : ctx.target?.side === "enemy"
            ? ctx.target.slot
            : -1;
      const u = slot >= 0 ? state.players[foeId].field[slot] : null;
      if (u) damageUnit(state, foeId, slot, Math.max(1, viewUnit(state, foeId, u, catalog).hp), emit);
      break;
    }
    case "bounce": {
      const foe = state.players[foeId];
      let slot = -1;
      if (e.to === "costliestEnemy") slot = costliestEnemy(state, player, catalog);
      else if (ctx.target?.side === "enemy") slot = ctx.target.slot;
      const u = slot >= 0 ? foe.field[slot] : null;
      if (!u) break;
      bounceUnit(state, foeId, slot, emit);
      break;
    }
    case "delayedDamage": {
      const cardId = self?.cardId ?? "";
      const foe = state.players[foeId];
      foe.delayedDamage = [...(foe.delayedDamage ?? []), { cardId, amount: e.amount, turn: state.turn }];
      emit({ type: "delayedDamageSet", player: foeId, cardId, amount: e.amount });
      break;
    }
    case "addToHand":
      for (const id of e.cards) {
        if (me.hand.length >= MAX_HAND) break;
        me.hand.push(id);
        emit({ type: "drew", player, cardId: id });
      }
      break;
    case "discountHand": {
      // 手札でいちばんコストが高い、その属性のカード（同じなら先に持っていた方）
      let best: string | undefined;
      for (const id of me.hand) {
        if (!must(catalog, id).attributes.includes(e.attribute)) continue;
        if (
          best === undefined ||
          effectiveCost(state, player, id, catalog) > effectiveCost(state, player, best, catalog)
        )
          best = id;
      }
      if (best === undefined) break;
      me.handDiscount = { ...me.handDiscount, [best]: (me.handDiscount?.[best] ?? 0) + e.amount };
      break;
    }
    case "damageCut":
      me.cutUntil = state.turn + 1;
      me.cutAmount = e.amount;
      emit({ type: "shield", player, kind: "shielded", amount: e.amount });
      break;
    case "shieldMaster":
      me.shieldUntil = state.turn + 1;
      emit({ type: "shield", player, kind: "shielded", amount: 0 });
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
          // 突進を付ける版：まだ動けなかったキャラクターは、相手のキャラクターにだけ攻撃できる
          u.rushOnly = !!e.totsu;
        } else if (!e.totsu) u.rushOnly = false;
        if (slot !== ctx.selfSlot && e.attack) {
          u.atkBuff += e.attack;
          emit({ type: "buffed", player, slot, cardId: u.cardId, attack: e.attack, hp: 0 });
        }
      });
      break;
    case "weaken":
      if (e.to === "allEnemies") {
        state.players[foeId].field.forEach((u, slot) => {
          if (!u) return;
          u.atkBuff -= e.attack;
          emit({ type: "buffed", player: foeId, slot, cardId: u.cardId, attack: -e.attack, hp: 0 });
        });
      } else if (tgt && ctx.target) {
        tgt.atkBuff -= e.attack;
      }
      break;
    case "drawPerAllies": {
      const n = Math.min(e.max, Math.floor(me.field.filter((u) => u).length / e.per));
      for (let i = 0; i < n; i++) draw(state, player, emit);
      break;
    }
    case "transform": {
      const foe = state.players[foeId];
      let slot = -1;
      if (e.to === "strongestEnemy") slot = strongestEnemy(state, player, catalog);
      else if (ctx.target?.side === "enemy") slot = ctx.target.slot;
      const u = slot >= 0 ? foe.field[slot] : null;
      if (!u) break;
      // 元のカードは消える（墓地に行かないので、闇の気配も出ない）
      const into = newUnit(state, e.card, catalog, true);
      Object.assign(into, { canAttack: false, attacksLeft: 0, rushOnly: false });
      foe.field[slot] = into;
      emit({ type: "transformed", player: foeId, slot, cardId: u.cardId, into: e.card });
      break;
    }
    case "cleanse":
      for (const owner of e.to === "allEnemies" ? [foeId] : (["p1", "p2"] as const)) {
        state.players[owner].field.forEach((u, slot) => {
          if (!u) return;
          const wasDark = u.dark;
          Object.assign(u, {
            atkBuff: 0,
            tempAtk: 0,
            hpBuff: 0,
            exposed: false,
            exposeAtTurnEnd: false,
            boundUntil: 0,
            silenced: false,
            noGuard: false,
          });
          if (wasDark) {
            // 元の姿に戻る（もう一度は闇堕ちしない。破壊されたら墓地へ）
            Object.assign(u, { dark: false, damage: 0 });
            emit({ type: "restored", player: owner, slot, cardId: u.cardId });
          }
        });
      }
      break;
    case "growOnTokenLost":
    case "conspiracyWin":
    case "extraAttackOnKill":
    case "buffOnKill":
    case "faceOnKill":
    case "healBounce":
    case "focusAura":
    case "lullaby":
    case "cheaperPerAlly":
    case "cheaperPerPost":
    case "cheaperPerGuard":
    case "armor":
      break; // 場にいる間・手札にある間ずっと効く（それぞれの場所で計算）
  }
}

/** 闇堕ちの姿で場に出す。出たターンから相手のキャラクターに攻撃できる（突進。速攻を持つ姿ならプレイヤーも） */
function darkRise(
  state: GameState,
  player: PlayerId,
  cardId: string,
  slot: number,
  catalog: Catalog,
  config: Config,
  emit: Emit,
) {
  const me = state.players[player];
  const card = must(catalog, cardId);
  const u = Object.assign(newUnit(state, cardId, catalog, false), { dark: true, darkUsed: true });
  const darkRush = hasKeyword(u, "速攻", catalog);
  Object.assign(u, {
    canAttack: true,
    attacksLeft: hasKeyword(u, "連撃", catalog) ? 2 : 1,
    rushOnly: !darkRush,
  });
  me.field[slot] = u;
  emit({ type: "darkFall", player, slot, cardId });
  const ctx: Ctx = { state, player, catalog, config, emit, selfSlot: slot, playedBefore: 0 };
  for (const e of card.dark?.effects ?? []) if (triggerOf(e) === "play") runEffect(e, ctx);
  resolveDeaths(state, catalog, emit, config);
}

/** ターンの始め：コストの回復、攻撃の準備、注目、子守唄、ドロー */
function startTurn(state: GameState, pid: PlayerId, catalog: Catalog, config: Config, emit: Emit) {
  const p = state.players[pid];
  const other = opponent(pid);
  state.active = pid;
  state.turn += 1;
  p.turnsTaken = (p.turnsTaken ?? 0) + 1;
  p.maxMana = Math.min(config.maxMana, p.maxMana + 1);
  // 後攻の最初のターンだけコストを足す（先攻有利を和らげる）
  p.mana = p.maxMana + (state.turn === 2 ? config.secondBonusMana : 0);
  p.playedThisTurn = 0;
  emit({ type: "turnStarted", player: pid, turn: state.turn, mana: p.mana });
  const center = p.field[CENTER_SLOT];
  const aura = !!center && hasPassive(center, "focusAura", catalog);
  p.field.forEach((u, slot) => {
    if (!u) return;
    u.canAttack = true;
    u.attacksLeft = hasKeyword(u, "連撃", catalog) ? 2 : 1;
    u.rushOnly = false;
    // 注目：ターンの始めに攻撃力が伸びる（真ん中の枠なら多く）。センターのトップアイドルがいれば全員
    if (hasKeyword(u, "注目", catalog) || aura) {
      const n = slot === CENTER_SLOT ? 2 : 1;
      u.atkBuff += n;
      emit({ type: "buffed", player: pid, slot, cardId: u.cardId, attack: n, hp: 0 });
    }
  });
  // 闇の気配：破壊された闇堕ちを持つカードが、闇堕ちの姿で戻ってくる（破壊された枠。埋まっていればほかの空き枠。なければ待つ）
  const waiting: { cardId: string; slot: number }[] = [];
  for (const omen of p.darkOmens ?? []) {
    const slot = p.field[omen.slot] ? p.field.findIndex((u) => !u) : omen.slot;
    const at = p.trash.lastIndexOf(omen.cardId);
    if (at < 0) continue; // 墓地から無くなっていたら（蘇生などで）、闇の気配も消える
    if (slot < 0) {
      waiting.push(omen);
      continue;
    }
    p.trash.splice(at, 1);
    darkRise(state, pid, omen.cardId, slot, catalog, config, emit);
  }
  p.darkOmens = waiting;
  // 子守唄：相手の場にいれば、攻撃力がいちばん高いキャラクターがこのターン眠る
  if (state.players[other].field.some((u) => u && hasPassive(u, "lullaby", catalog))) {
    const slot = strongestEnemy(state, other, catalog);
    const u = slot >= 0 ? p.field[slot] : null;
    if (u) {
      u.boundUntil = Math.max(u.boundUntil, state.turn);
      emit({ type: "status", player: pid, slot, cardId: u.cardId, status: "眠り" });
    }
  }
  // 陰謀論者：自分のターンの始めに山札が0枚なら勝ち（ドローより先に見る）
  const plotter = p.field.find((u) => u && hasPassive(u, "conspiracyWin", catalog));
  if (plotter && p.deck.length === 0) {
    emit({ type: "specialWin", player: pid, cardId: plotter.cardId });
    state.winner = pid;
    emit({ type: "won", player: pid });
    return;
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
  if (action.type === "resign" || action.type === "timeout") {
    state.winner = opponent(action.player);
    emit({ type: action.type === "resign" ? "resigned" : "timedOut", player: action.player });
    emit({ type: "won", player: state.winner });
    return { state, events };
  }
  // 差し出し待ち：選ぶ番の人の「差し出し」だけを受け付ける
  if (state.pending) {
    if (action.type !== "sacrifice")
      throw new RuleError(
        "pending",
        state.pending.waiting.includes(action.player)
          ? "差し出す自分のキャラクターを1体選んでください"
          : "相手が差し出すキャラクターを選ぶまで待ってください",
      );
    if (!state.pending.waiting.includes(action.player))
      throw new RuleError("not_waiting", "あなたはもう選んでいます");
    if (!sacrificeCandidates(state, action.player).includes(action.slot))
      throw new RuleError("bad_slot", "そのキャラクターは選べません");
    const pend = state.pending;
    pend.picks[action.player] = action.slot;
    pend.waiting = pend.waiting.filter((p) => p !== action.player);
    if (pend.waiting.length === 0) {
      // 全員が選び終えたら、一度に破壊する
      for (const [pid, slot] of Object.entries(pend.picks) as [PlayerId, number][]) {
        const u = state.players[pid].field[slot];
        if (!u) continue;
        emit({ type: "sacrificed", player: pid, slot, cardId: u.cardId });
        u.damage += Math.max(1, viewUnit(state, pid, u, catalog).hp);
      }
      state.pending = null;
      resolveDeaths(state, catalog, emit, config);
      checkWinner(state, pend.source, emit);
    }
    return { state, events };
  }
  if (action.type === "sacrifice") throw new RuleError("no_pending", "今は差し出す場面ではありません");
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
      if (card.type !== "icon") throw new RuleError("not_icon", "呪文は場に出せません");
      if (action.slot < 0 || action.slot >= SLOTS) throw new RuleError("bad_slot", "その場所には出せません");
      if (me.field[action.slot]) throw new RuleError("slot_taken", "その場所にはすでにキャラクターがいます");
      const cost = effectiveCost(state, player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `コストが足りません（必要 ${cost}・残り ${me.mana}）`);
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      useDiscount(me, cardId);
      // トークン（伝説のコラ画像の写しなど）は、出してもトークンのまま
      const placed = newUnit(state, cardId, catalog, card.token === true);
      me.field[action.slot] = placed;
      const playedBefore = me.playedThisTurn++;
      emit({ type: "played", player, cardId, slot: action.slot, cost });
      const ctx: Ctx = { state, player, catalog, config, emit, selfSlot: action.slot, playedBefore };
      // 出たときにガードを得る効果（リスナー）を先に決めてから、ガードを数える
      for (const e of card.effects)
        if (e.do === "guardIfKaiwai" && triggerOf(e) === "play") runEffect(e, ctx);
      countGuard(state, player, placed, catalog);
      for (const e of card.effects)
        if (triggerOf(e) === "play" && e.do !== "guardIfKaiwai") runEffect(e, ctx);
      // 「先に出した」数は、このキャラクターの効果のあとで数える
      me.played = { ...me.played, [cardId]: (me.played?.[cardId] ?? 0) + 1 };
      resolveDeaths(state, catalog, emit, config);
      break;
    }
    case "buzz": {
      const why = buzzBlock(state, player);
      if (why) throw new RuleError("no_buzz", why);
      const u = me.field[action.slot];
      if (!u) throw new RuleError("bad_slot", "バズさせる自分のキャラクターを選んでください");
      me.buzzLeft = (me.buzzLeft ?? 0) - 1;
      me.buzzTurn = state.turn;
      u.atkBuff += config.buzzAttack;
      u.hpBuff += config.buzzHp;
      // 突進：まだ攻撃できないキャラクター（出したばかり）も、このターン相手のキャラクターに攻撃できる
      if (!u.canAttack) {
        u.canAttack = true;
        u.attacksLeft = hasKeyword(u, "連撃", catalog) ? 2 : 1;
        u.rushOnly = true;
      }
      emit({
        type: "buzz",
        player,
        slot: action.slot,
        cardId: u.cardId,
        attack: config.buzzAttack,
        hp: config.buzzHp,
        left: me.buzzLeft,
      });
      // 便乗：どちらのバズでも、場の便乗を持つキャラクターすべてに攻撃力+1・体力+1（バズを使った側から）。
      // バズしたキャラクター自身には乗らない（+2/+2 に +1/+1 が重なると強すぎる。10月25日）
      for (const pid of [player, opponent(player)] as const)
        state.players[pid].field.forEach((b, slot) => {
          if (!b || b === u || !hasKeyword(b, "便乗", catalog)) return;
          b.atkBuff += 1;
          b.hpBuff += 1;
          emit({ type: "buffed", player: pid, slot, cardId: b.cardId, attack: 1, hp: 1 });
        });
      break;
    }
    case "cast": {
      const cardId = me.hand[action.handIndex];
      if (cardId === undefined) throw new RuleError("no_card", "そのカードは手札にありません");
      const card = must(catalog, cardId);
      if (card.type !== "post") throw new RuleError("not_post", "キャラクターは場に出して使います");
      const cost = effectiveCost(state, player, cardId, catalog);
      if (cost > me.mana)
        throw new RuleError("no_mana", `コストが足りません（必要 ${cost}・残り ${me.mana}）`);
      if (card.target) {
        const ok = castTargets(state, player, cardId, catalog).some(
          (t) => t.side === action.target?.side && t.slot === action.target?.slot,
        );
        if (!ok) throw new RuleError("bad_target", "その相手には使えません");
      }
      me.mana -= cost;
      me.hand.splice(action.handIndex, 1);
      useDiscount(me, cardId);
      me.trash.push(cardId);
      me.postsUsed = (me.postsUsed ?? 0) + 1;
      const playedBefore = me.playedThisTurn++;
      emit({ type: "cast", player, cardId, cost, target: action.target });
      const ctx: Ctx = { state, player, catalog, config, emit, target: action.target, playedBefore };
      for (const e of card.effects) if (triggerOf(e) === "play") runEffect(e, ctx);
      resolveDeaths(state, catalog, emit, config);
      break;
    }
    case "attack": {
      const atk = me.field[action.from];
      if (!atk) throw new RuleError("no_unit", "攻撃するキャラクターがいません");
      if (state.turn <= atk.boundUntil)
        throw new RuleError("asleep", "このキャラクターは眠っていて攻撃できません");
      if (!canUnitAttack(state, atk))
        throw new RuleError("cannot_attack", "このキャラクターは今は攻撃できません");
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
            ? "攻撃先のキャラクターがいません"
            : "相手の場にガードがいる間は、ガードしか攻撃できません",
        );
      }
      atk.attacksLeft -= 1;
      // 突進で攻撃したとき（出たターンに相手のキャラクターへ）の効果は、ダメージの前に働く（上がった攻撃力で殴る）
      runRushEffects(state, player, action.from, t, catalog, config, emit);
      const av = viewUnit(state, player, atk, catalog);
      if (t.kind === "leader") {
        damageLeader(state, foeId, av.attack, emit);
      } else {
        // お互いの攻撃力の分だけ、相手の体力を削る（ダメージは残る）
        const def = foe.field[t.slot] as Unit;
        const { toDefender, toAttacker } = previewRaw(
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
        const destroyed = resolveDeaths(state, catalog, (e) => after.push(e), config);
        // 相手を破壊したら、もう1回攻撃できる（破壊した側が残っていれば）
        const left = foe.field[t.slot];
        const killed = !left || left.uid !== def.uid;
        const alive = me.field[action.from];
        if (killed && alive?.uid === atk.uid && hasPassive(alive, "extraAttackOnKill", catalog)) {
          alive.attacksLeft += 1;
        }
        // 破壊するたび、自分の決まったキャラクターすべてに強化（メン地下。殴り合いで自分が倒れても働く）
        if (killed)
          for (const fx of effectsOf(atk, catalog)) {
            if (fx.do !== "buffOnKill" || triggerOf(fx) !== "passive") continue;
            me.field.forEach((u, slot) => {
              if (!u || !fx.cards.includes(u.cardId)) return;
              u.atkBuff += fx.attack;
              u.hpBuff += fx.hp;
              after.push({ type: "buffed", player, slot, cardId: u.cardId, attack: fx.attack, hp: fx.hp });
            });
          }
        // 破壊するたび、相手のプレイヤーにダメージ（ヒバナ。殴り合いで自分が倒れても働く）
        if (killed)
          for (const fx of effectsOf(atk, catalog)) {
            if (fx.do !== "faceOnKill" || triggerOf(fx) !== "passive") continue;
            damageLeader(state, foeId, fx.amount, (e) => after.push(e));
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
      // このターンだけの強化を消す（両者の場）
      for (const owner of ["p1", "p2"] as const)
        for (const u of state.players[owner].field) if (u) u.tempAtk = 0;
      // 炎上商法：ターンの終わりに晒し状態になる
      me.field.forEach((u, slot) => {
        if (u?.exposeAtTurnEnd) exposeUnit(player, slot, u, emit);
      });
      // ターンの終わりに働く効果
      me.field.forEach((u, slot) => {
        if (!u) return;
        for (const e of effectsOf(u, catalog)) {
          if (triggerOf(e) !== "turnEnd") continue;
          runEffect(e, { state, player, catalog, config, emit, selfSlot: slot, playedBefore: 0 });
        }
      });
      resolveDeaths(state, catalog, emit, config);
      // プレイヤーに付いた「次の自分のターンの終わりにダメージを受ける」効果（前のターンまでに付いたもの）が働く
      const due = (me.delayedDamage ?? []).filter((d) => d.turn < state.turn);
      if (due.length > 0) {
        me.delayedDamage = (me.delayedDamage ?? []).filter((d) => d.turn >= state.turn);
        for (const d of due) {
          emit({ type: "delayedDamageFired", player, cardId: d.cardId, amount: d.amount });
          damageLeader(state, player, d.amount, emit);
        }
        checkWinner(state, player, emit);
        if (state.winner) break;
      }
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
