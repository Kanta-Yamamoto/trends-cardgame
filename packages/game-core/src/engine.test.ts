import { ATTRIBUTES, CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { autoSacrifice, planTurn } from "./ai";
import { deckAttributes, encodeCustomDeck, resolveDeckRef, validateDeck } from "./deck";
import {
  applyAction,
  attackTargets,
  buzzBlock,
  buzzLeft,
  castTargets,
  createGame,
  damageCutOn,
  darkFallSlots,
  darkOmenAwake,
  darkOmens,
  delayedDamageOn,
  effectiveCost,
  isShielded,
  legalTargets,
  openSlots,
  previewAttack,
  viewUnit,
  withRushBoost,
} from "./engine";
import { planTurnSearch } from "./search";
import { type Action, type DarkOmen, type GameState, type RuleCard, RuleError, type Unit } from "./types";

type Extra = Partial<RuleCard>;
const icon = (id: string, cost: number, attack: number, hp: number, extra: Extra = {}): RuleCard => ({
  id,
  type: "icon",
  cost,
  attack,
  hp,
  keywords: [],
  effects: [],
  attributes: ["自然"],
  kaiwai: [],
  rarity: 1,
  ...extra,
});
const post = (id: string, cost: number, extra: Extra): RuleCard => ({
  id,
  type: "post",
  cost,
  keywords: [],
  effects: [],
  attributes: ["神"],
  kaiwai: [],
  rarity: 1,
  ...extra,
});

const catalog: Record<string, RuleCard> = {
  f: icon("f", 1, 1, 1),
  wall: icon("wall", 2, 1, 6),
  big: icon("big", 4, 6, 6),
  rush: icon("rush", 1, 1, 1, { keywords: ["速攻"] }),
  twin: icon("twin", 2, 2, 3, { keywords: ["速攻", "連撃"] }),
  basher: icon("basher", 2, 2, 5, { keywords: ["速攻"] }),
  totsu: icon("totsu", 2, 2, 2, { keywords: ["突進"] }),
  bin: icon("bin", 1, 1, 3, { keywords: ["便乗"] }),
  charger: icon("charger", 3, 2, 3, {
    keywords: ["突進"],
    effects: [{ on: "rush", do: "buffSelf", attack: 2, hp: 2 }],
  }),
  idol: icon("idol", 2, 1, 3, { keywords: ["注目"] }),
  guard: icon("guard", 2, 1, 5, { keywords: ["ガード"] }),
  cat: icon("cat", 3, 1, 2, { effects: [{ on: "play", do: "summon", card: "kusa", count: 2 }] }),
  copy: icon("copy", 2, 1, 1, { effects: [{ on: "play", do: "copySelf" }] }),
  nori: icon("nori", 2, 2, 2, { effects: [{ on: "play", do: "buffSelfPerPlayed", attack: 1 }] }),
  kora: icon("kora", 5, 2, 5, { effects: [{ on: "play", do: "attackPerAlly" }] }),
  kami: icon("kami", 7, 4, 7, { keywords: ["ガード"], effects: [{ on: "play", do: "removeEnemyGuards" }] }),
  expert: icon("expert", 5, 4, 5, {
    effects: [{ on: "play", do: "damage", to: "strongestEnemy", amount: 3 }],
  }),
  healer: icon("healer", 5, 3, 5, {
    effects: [{ on: "play", do: "heal", to: "allAlliesAndMaster", amount: 2 }],
  }),
  ren: icon("ren", 6, 5, 4, {
    rarity: 5,
    keywords: ["連撃"],
    dark: {
      name: "闇堕ちレン",
      attack: 7,
      hp: 3,
      keywords: ["連撃"],
      effects: [{ on: "play", do: "damage", to: "allEnemies", amount: 1 }],
      effect: "",
    },
  }),
  kusa: icon("kusa", 0, 1, 1, { token: true }),
  expose: post("expose", 1, { target: "enemyIcon", effects: [{ do: "expose" }, { do: "draw", count: 1 }] }),
  fire: post("fire", 3, { target: "enemyIcon", effects: [{ do: "damage", amount: 3 }, { do: "expose" }] }),
  sleep: post("sleep", 2, { target: "enemyIcon", effects: [{ do: "bind" }] }),
  note: post("note", 2, { target: "enemyIcon", effects: [{ do: "silence" }, { do: "weaken", attack: 2 }] }),
  fansa: post("fansa", 2, { target: "allyIcon", effects: [{ do: "buff", attack: 2, hp: 2 }] }),
  meadow: post("meadow", 3, { effects: [{ do: "fill", card: "kusa" }] }),
  cleanse: post("cleanse", 4, { effects: [{ do: "cleanse" }] }),
  cleanseFoes: post("cleanseFoes", 3, { effects: [{ do: "cleanse", to: "allEnemies" }] }),
  hype: post("hype", 2, {
    target: "allyIcon",
    effects: [{ do: "hype", attack: 3 }],
  }),
  hibana: icon("hibana", 7, 2, 3, { effects: [{ do: "damagePerEnemy", per: 2 }] }),
  hyper: icon("hyper", 6, 4, 3, { keywords: ["速攻"], effects: [{ do: "hype", attack: 3 }] }),
  plotter: icon("plotter", 1, 4, 4, { effects: [{ on: "passive", do: "conspiracyWin" }] }),
  burner: icon("burner", 1, 1, 1, { effects: [{ on: "death", do: "draw", count: 1 }] }),
  popper: icon("popper", 2, 1, 1, { effects: [{ on: "death", do: "damage", to: "allEnemies", amount: 1 }] }),
  eater: icon("eater", 3, 1, 3, {
    effects: [{ on: "play", do: "attackPerLostToken", card: "kusa" }],
    dark: {
      name: "毒草喰らい",
      attack: 1,
      hp: 3,
      keywords: ["速攻"],
      effects: [{ on: "play", do: "attackPerLostToken", card: "kusa" }],
      effect: "",
    },
  }),
  fixer: icon("fixer", 4, 2, 3, { effects: [{ do: "sacrifice" }] }),
  judge: icon("judge", 5, 2, 5, { effects: [{ do: "judge" }] }),
  director: icon("director", 5, 2, 4, { effects: [{ do: "stageAces" }] }),
  hagashi: post("hagashi", 3, {
    effects: [
      { do: "damage", to: "allEnemies", amount: 1 },
      { do: "damage", to: "allEnemies", amount: 1, if: { kaiwai: "アイドル", atLeast: 1 } },
    ],
  }),
  flamer: icon("flamer", 1, 1, 1, { attributes: ["炎"] }),
  rider: icon("rider", 2, 2, 2, {
    attributes: ["炎"],
    effects: [{ on: "play", do: "buffSelf", attack: 1, hp: 0, if: { allies: "炎", atLeast: 2 } }],
  }),
  host: icon("host", 5, 3, 5, { effects: [{ on: "play", do: "buffAllies", attack: 1, hp: 0 }] }),
  queen: icon("queen", 7, 5, 5, {
    effects: [
      { on: "play", do: "damage", to: "allEnemies", amount: 2 },
      { on: "play", do: "damage", to: "enemyMaster", amount: 2 },
    ],
  }),
  voice: icon("voice", 6, 3, 7, { effects: [{ on: "play", do: "bind", to: "allEnemies" }] }),
  asmr: icon("asmr", 3, 2, 4, { effects: [{ on: "play", do: "bind", to: "strongestEnemy" }] }),
  burn: post("burn", 2, { effects: [{ do: "damage", to: "enemyMaster", amount: 3 }] }),
  chain: icon("chain", 2, 2, 9, {
    keywords: ["速攻"],
    effects: [{ on: "passive", do: "extraAttackOnKill" }],
  }),
  aura: icon("aura", 3, 1, 5, { keywords: ["注目"], effects: [{ on: "passive", do: "focusAura" }] }),
  thief: icon("thief", 2, 1, 3, { effects: [{ on: "play", do: "steal", maxAttack: 1 }] }),
  lull: icon("lull", 2, 1, 7, { effects: [{ on: "passive", do: "lullaby" }] }),
  reader: icon("reader", 2, 1, 3, { effects: [{ on: "turnEnd", do: "draw", count: 1 }] }),
  swarm: icon("swarm", 9, 2, 5, {
    effects: [
      { on: "hand", do: "cheaperPerAlly" },
      { on: "play", do: "rally", attack: 2 },
      { on: "play", do: "breakthrough" },
    ],
  }),
  scholar: icon("scholar", 12, 4, 5, {
    effects: [
      { on: "hand", do: "cheaperPerPost" },
      { on: "play", do: "extraTurn" },
    ],
  }),
  sweeper: icon("sweeper", 3, 2, 3, { effects: [{ on: "play", do: "sweep", maxHp: 1 }] }),
  nurse: icon("nurse", 3, 2, 3, { effects: [{ on: "play", do: "revive", maxCost: 2 }] }),
  // 第6弾：変身・場の数で引く・相手全体の攻撃力を下げる
  meme: post("meme", 3, { target: "enemyIcon", effects: [{ do: "transform", card: "kusa" }] }),
  replies: post("replies", 2, { effects: [{ do: "drawPerAllies", per: 2, max: 3 }] }),
  gloom: icon("gloom", 5, 4, 4, { effects: [{ on: "play", do: "weaken", to: "allEnemies", attack: 2 }] }),
  pet: icon("pet", 1, 1, 1, { effects: [{ on: "play", do: "heal", to: "master", amount: 3 }] }),
  dj: icon("dj", 3, 2, 3, { effects: [{ on: "passive", do: "healGrow", attack: 1, hp: 1 }] }),
  sauna: icon("sauna", 6, 3, 6, {
    effects: [
      { on: "play", do: "heal", to: "master", amount: 3 },
      { on: "passive", do: "healBurn", amount: 2 },
    ],
  }),
  yuru: icon("yuru", 8, 5, 8, { effects: [{ on: "hand", do: "cheaperPerHeal" }] }),
  shiba: icon("shiba", 4, 2, 3, { effects: [{ on: "passive", do: "healStrike", amount: 1 }] }),
  // 破壊されたとき・ターンの終わり・突進で攻撃したときの組み合わせ（10月23日のコスト 1〜8 の見直し）
  hamster: icon("hamster", 2, 1, 2, { effects: [{ on: "death", do: "heal", to: "master", amount: 3 }] }),
  sprout: icon("sprout", 2, 1, 1, { effects: [{ on: "death", do: "summon", card: "kusa", count: 2 }] }),
  flare: icon("flare", 4, 2, 3, { effects: [{ on: "death", do: "damage", to: "allEnemies", amount: 1 }] }),
  leader: icon("leader", 4, 2, 3, { effects: [{ on: "turnEnd", do: "buffRandomAlly", attack: 1, hp: 0 }] }),
  pup: icon("pup", 4, 2, 2, {
    keywords: ["突進"],
    effects: [{ on: "rush", do: "summon", card: "kusa", count: 1 }],
  }),
  // 界隈を読む効果のテスト用（配信者 s1/s2、アイドル idl、無所属 f）
  s1: icon("s1", 1, 1, 1, { kaiwai: ["配信者"] }),
  s2: icon("s2", 1, 1, 1, { kaiwai: ["配信者", "アイドル"] }),
  idl: icon("idl", 1, 1, 1, { kaiwai: ["アイドル"] }),
  collab: icon("collab", 3, 2, 3, {
    kaiwai: ["配信者"],
    effects: [{ on: "play", do: "attackPerAlly", kaiwai: "配信者" }],
  }),
  producer: icon("producer", 5, 2, 5, {
    effects: [{ on: "play", do: "buffAllies", attack: 2, hp: 1, kaiwai: "アイドル" }],
  }),
  critic: icon("critic", 2, 1, 3, {
    kaiwai: ["有識者"],
    effects: [
      { on: "play", do: "draw", count: 1 },
      { on: "play", do: "draw", count: 1, if: { kaiwai: "アイドル", atLeast: 1 } },
    ],
  }),
  quoteRt: post("quoteRt", 2, { effects: [{ do: "tutor", kaiwai: "有識者", count: 1 }] }),
  letter: post("letter", 2, {
    target: "allyIcon",
    targetKaiwai: "アイドル",
    effects: [{ do: "buff", attack: 2, hp: 2 }],
  }),
  cheapStreamer: icon("cheapStreamer", 5, 3, 3, {
    effects: [{ on: "hand", do: "cheaperPerAlly", kaiwai: "配信者" }],
  }),
  ronpa: post("ronpa", 4, { target: "enemyIcon", effects: [{ do: "destroy" }] }),
  oibi: post("oibi", 3, {
    target: "enemyIcon",
    targetFilter: { damaged: true },
    effects: [{ do: "destroy" }],
  }),
  block: post("block", 3, { target: "enemyIcon", effects: [{ do: "bounce" }] }),
  hikinuki: post("hikinuki", 4, {
    target: "enemyIcon",
    targetFilter: { maxAttack: 3 },
    effects: [{ do: "steal", maxAttack: 3 }],
  }),
  kill: post("kill", 3, { effects: [{ do: "destroy", to: "strongestEnemy" }] }),
  back: post("back", 3, { effects: [{ do: "bounce", to: "costliestEnemy" }] }),
  barrier: post("barrier", 2, { effects: [{ do: "shieldMaster" }] }),
  oracle: icon("oracle", 6, 3, 5, {
    attributes: ["神"],
    effects: [{ on: "play", do: "delayedDamage", amount: 7 }],
  }),
  again: post("again", 1, { effects: [{ do: "extraTurn" }] }),
  therapy: post("therapy", 2, { effects: [{ do: "heal", to: "allAlliesAndMaster", amount: 2 }] }),
};
const F = (n: number) => Array.from({ length: n }, () => "f");

/** 山札を並び替えずに作る。コストは十分に持たせる */
function game(p1: string[], p2: string[] = F(12), mana = 10): GameState {
  const s = createGame({
    decks: { p1: [...p1, ...F(10)], p2: [...p2, ...F(10)] },
    seed: 42,
    shuffle: false,
    config: { startHand: 4 },
  });
  s.players.p1.mana = mana;
  s.players.p1.maxMana = mana;
  return s;
}
const run = (s: GameState, a: Action) => applyAction(s, a, catalog);
const play = (s: GameState, handIndex: number, slot: number, player: "p1" | "p2" = "p1") =>
  run(s, { type: "play", player, handIndex, slot }).state;
const cast = (s: GameState, handIndex: number, target?: { side: "enemy" | "ally"; slot: number }) =>
  run(s, { type: "cast", player: "p1", handIndex, target }).state;
const end = (s: GameState, player: "p1" | "p2" = "p1") => run(s, { type: "endTurn", player }).state;
/** 闇堕ち：裏向きのカードを、その枠に闇堕ちの姿で出す */
const fall = (s: GameState, slot: number, player: "p1" | "p2" = "p1") =>
  run(s, { type: "darkFall", player, slot }).state;
const hit = (s: GameState, from: number, slot: number) =>
  run(s, { type: "attack", player: "p1", from, target: { kind: "unit", slot } });
const face = (s: GameState, from: number) =>
  run(s, { type: "attack", player: "p1", from, target: { kind: "leader" } });

/** 相手（p2）の場に、手札の先頭から順にキャラクターを並べて p1 のターンに戻す */
function withFoe(p1: string[], p2: string[]): GameState {
  let s = game(p1, p2);
  s = end(s);
  s.players.p2.mana = 30;
  p2.forEach((_, i) => {
    s = play(s, 0, i, "p2");
  });
  s = end(s, "p2");
  s.players.p1.mana = 10;
  return s;
}

describe("準備とターン", () => {
  it("場は5枠。先攻は手札3枚・コスト1、後攻は手札4枚で最初のターンだけコスト+1", () => {
    const s = createGame({ decks: { p1: F(25), p2: F(25) }, seed: 1 });
    expect(s.players.p1.field).toHaveLength(5);
    expect(s.players.p1.hand).toHaveLength(3);
    expect(s.players.p2.hand).toHaveLength(4);
    const t2 = end(s);
    expect(t2.players.p2.mana).toBe(2);
    expect(end(end(t2, "p2")).players.p2.mana).toBe(2);
  });
  it("手札は9枚まで。いっぱいのときに引いたカードは墓地へ", () => {
    const s = createGame({ decks: { p1: F(25), p2: F(25) }, seed: 1 });
    s.players.p2.hand = Array(9).fill("f");
    const r = run(s, { type: "endTurn", player: "p1" });
    expect(r.state.players.p2.hand).toHaveLength(9);
    expect(r.state.players.p2.trash).toHaveLength(1);
    expect(r.events.map((e) => e.type)).toContain("burned");
  });
  it("山札が引けなければ、そのプレイヤーの負け", () => {
    const s = createGame({ decks: { p1: F(4), p2: F(4) }, shuffle: false });
    const r = run(s, { type: "endTurn", player: "p1" });
    expect(r.state.winner).toBe("p1");
  });
  it("相手のターンには操作できない／元の state は変更しない", () => {
    const s = game(["f"]);
    expect(() => run(s, { type: "endTurn", player: "p2" })).toThrow(/相手のターン/);
    play(s, 0, 0);
    expect(s.players.p1.field[0]).toBeNull();
  });
});

describe("場に出す・呪文を使う", () => {
  it("キャラクターはコストを払って空いた枠に出る。呪文は場に出せない", () => {
    const s = play(game(["big"]), 0, 4);
    expect(s.players.p1.field[4]?.cardId).toBe("big");
    expect(s.players.p1.mana).toBe(6);
    expect(() => play(game(["fansa"]), 0, 0)).toThrow(/呪文/);
    expect(() => play(game(["big"], undefined, 3), 0, 0)).toThrow(RuleError);
  });
  it("対象が必要な呪文は、正しい対象がないと使えない。使った呪文は墓地へ", () => {
    const s = withFoe(["fire"], ["wall"]);
    expect(() => cast(s, 0)).toThrow(/その相手/);
    const r = cast(s, 0, { side: "enemy", slot: 0 });
    expect(r.players.p2.field[0]?.damage).toBe(3);
    expect(r.players.p1.trash).toContain("fire");
  });
});

describe("キーワード", () => {
  it("速攻は出したターンに攻撃でき、連撃は2回攻撃できる", () => {
    let s = play(game(["twin"]), 0, 0);
    s = face(s, 0).state;
    s = face(s, 0).state;
    expect(s.players.p2.lp).toBe(16);
    expect(() => face(s, 0)).toThrow(/攻撃できません/);
  });
  it("突進：場に出たターンに相手のキャラクターにだけ攻撃できる（プレイヤーは不可）。次のターンからは普通", () => {
    let s = withFoe(["totsu"], ["wall"]);
    s = play(s, 0, 0);
    expect(attackTargets(s, "p1", 0, catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    expect(() => face(s, 0)).toThrow(/攻撃/);
    s = hit(s, 0, 0).state;
    expect(s.players.p2.field[0]?.damage).toBe(2);
    s = end(end(s), "p2");
    expect(attackTargets(s, "p1", 0, catalog)).toContainEqual({ kind: "leader" });
  });
  it("突進で攻撃したとき：上がった攻撃力で殴り、強化は残る。次のターン以降や、プレイヤーへの攻撃では働かない", () => {
    let s = withFoe(["charger"], ["wall"]);
    s = play(s, 0, 0);
    const r = hit(s, 0, 0);
    expect(r.events.map((e) => e.type)).toEqual(["buffed", "battle"]);
    expect(r.events[1]).toMatchObject({ type: "battle", toDefender: 4, toAttacker: 1 });
    s = r.state;
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog)).toMatchObject({ attack: 4, hp: 4 });
    // 次のターンは普通の攻撃（突進の効果は出たターンだけ）
    s = end(end(s), "p2");
    const r2 = hit(s, 0, 0);
    expect(r2.events.map((e) => e.type)).not.toContain("buffed");
  });
  it("突進の強化は先に取り出せる（画面で強化を見せてから殴る）。見込みも上がった攻撃力で出す", () => {
    let s = withFoe(["charger"], ["wall"]);
    s = play(s, 0, 0);
    const t = { kind: "unit" as const, slot: 0 };
    const b = withRushBoost(s, "p1", 0, t, catalog);
    expect(b.state).not.toBe(s);
    expect(b.events.map((e) => e.type)).toEqual(["buffed"]);
    expect(viewUnit(b.state, "p1", b.state.players.p1.field[0] as never, catalog).attack).toBe(4);
    // 元の state は変えない
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog).attack).toBe(2);
    expect(previewAttack(s, "p1", 0, t, catalog)).toMatchObject({ toDefender: 4 });
    // 攻撃そのものの結果と同じ
    expect(hit(s, 0, 0).events[1]).toMatchObject({ type: "battle", toDefender: 4 });
    // プレイヤーへの攻撃や、突進のないキャラクターでは何もしない
    expect(withRushBoost(s, "p1", 0, { kind: "leader" }, catalog).state).toBe(s);
  });
  it("攻撃の見込み：与える・受けるダメージと、破壊できるか・破壊されるか", () => {
    let s = withFoe(["basher"], ["wall"]);
    s = play(s, 0, 0);
    const before = viewUnit(s, "p2", s.players.p2.field[0] as never, catalog);
    const p = previewAttack(s, "p1", 0, { kind: "unit", slot: 0 }, catalog);
    expect(p).toMatchObject({ toDefender: 2, kills: 2 >= before.hp });
    const r = hit(s, 0, 0);
    expect(r.events[0]).toMatchObject({
      type: "battle",
      toDefender: p?.toDefender,
      toAttacker: p?.toAttacker,
    });
    expect(previewAttack(s, "p1", 0, { kind: "leader" }, catalog)).toMatchObject({
      toDefender: 2,
      toAttacker: 0,
    });
    expect(previewAttack(s, "p1", 3, { kind: "leader" }, catalog)).toBeNull();
  });
  it("注目：自分のターンの始めに攻撃力+1、真ん中の枠なら+2", () => {
    let s = play(play(game(["idol", "idol"]), 0, 0), 0, 2);
    s = end(end(s), "p2");
    const at = (slot: number) => viewUnit(s, "p1", s.players.p1.field[slot] as never, catalog).attack;
    expect(at(0)).toBe(2);
    expect(at(2)).toBe(3);
  });
  it("ガード：いる間は、ガードしか攻撃できない（ほかのキャラクターもプレイヤーも不可）", () => {
    let s = withFoe(["rush"], ["guard", "wall"]);
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    expect(() => face(s, 0)).toThrow(/ガード/);
    expect(() => hit(s, 0, 1)).toThrow(/ガード/);
  });
  it("晒し状態はガードを失い、それまでの強化が消える。ずっと続く", () => {
    let s = withFoe(["expose", "rush"], ["guard", "wall"]);
    (s.players.p2.field[0] as Unit).atkBuff = 2;
    (s.players.p2.field[0] as Unit).hpBuff = 2;
    // ガードの裏のキャラクターは、晒しても殴れない（例外のルールは無い）
    expect(legalTargets(s, "p1", catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    s = cast(s, 0, { side: "enemy", slot: 0 });
    s = play(s, 0, 0);
    const v = viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog);
    expect(v.exposed).toBe(true);
    expect(v.guard).toBe(false);
    expect([v.attack, v.maxHp]).toEqual([1, 5]);
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "leader" });
    for (let i = 0; i < 3; i++) s = end(end(s), "p2");
    expect(viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog).guard).toBe(false);
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "leader" });
  });
  it("晒されたあとに受けた強化は消えない", () => {
    let s = withFoe(["expose"], ["guard"]);
    s = cast(s, 0, { side: "enemy", slot: 0 });
    (s.players.p2.field[0] as Unit).atkBuff += 2;
    s = end(end(s), "p2");
    expect(viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog).attack).toBe(3);
  });
});

describe("炎上商法・TL浄化・剥がし", () => {
  it("炎上商法：このターン攻撃力+3。自分のターンの終わりに、そのキャラクターが晒し状態になる", () => {
    let s = game(["guard", "hype"]);
    s = play(s, 0, 0);
    (s.players.p1.field[0] as Unit).atkBuff = 1;
    s = cast(s, 0, { side: "ally", slot: 0 });
    let v = viewUnit(s, "p1", s.players.p1.field[0] as Unit, catalog);
    expect(v.attack).toBe(5);
    expect(v.exposed).toBe(false);
    expect(v.guard).toBe(true);
    const r = run(s, { type: "endTurn", player: "p1" });
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "status", player: "p1", status: "晒し" }),
    );
    v = viewUnit(r.state, "p1", r.state.players.p1.field[0] as Unit, catalog);
    expect(v.exposed).toBe(true);
    expect(v.guard).toBe(false);
    expect(v.attack).toBe(1);
  });
  it("炎上商法のキャラクターがそのターンに破壊されたら、何も起きない", () => {
    let s = game(["rush", "hype"]);
    s = play(s, 0, 0);
    s = cast(s, 0, { side: "ally", slot: 0 });
    s.players.p1.field[0] = null;
    expect(() => end(s)).not.toThrow();
  });
  it("TL浄化（相手だけ）：相手の強化と晒しを消し、自分の強化は残す", () => {
    let s = withFoe(["rush", "expose", "cleanseFoes"], ["guard", "wall"]);
    s = play(s, 0, 0);
    (s.players.p1.field[0] as Unit).atkBuff = 2;
    s = cast(s, 0, { side: "enemy", slot: 0 });
    (s.players.p2.field[1] as Unit).atkBuff = 3;
    s = cast(s, 0);
    const g = viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog);
    expect([g.exposed, g.guard]).toEqual([false, true]);
    expect((s.players.p2.field[1] as Unit).atkBuff).toBe(0);
    expect((s.players.p1.field[0] as Unit).atkBuff).toBe(2);
  });
  it("剥がし：相手全体に1ダメージ。自分の場にアイドルがいれば、さらに1ダメージ", () => {
    let s = withFoe(["hagashi"], ["wall", "big"]);
    s = cast(s, 0);
    expect(s.players.p2.field.map((u) => u?.damage)).toEqual([1, 1, undefined, undefined, undefined]);
    let t = withFoe(["idl", "hagashi"], ["wall", "big"]);
    t = play(t, 0, 0);
    t = cast(t, 0);
    expect(t.players.p2.field.map((u) => u?.damage)).toEqual([2, 2, undefined, undefined, undefined]);
  });
});

describe("★5 の作り直し（ヒバナ・カグラ・陰謀論者・クサハミ）", () => {
  it("ヒバナ：相手のキャラクターの数×2 のダメージを、相手のキャラクターすべてに", () => {
    let s = withFoe(["hibana"], ["wall"]);
    s = play(s, 0, 0);
    expect(s.players.p2.field[0]?.damage).toBe(2);
    let t = withFoe(["hibana"], ["wall", "big", "guard"]);
    t = play(t, 0, 0);
    expect(t.players.p2.field.filter((u) => u)).toHaveLength(0);
  });
  it("場に出たときの炎上商法（カグラ）：自分がこのターン攻撃力+3、ターンの終わりに晒し状態", () => {
    let s = game(["hyper"]);
    s = play(s, 0, 0);
    expect(viewUnit(s, "p1", s.players.p1.field[0] as Unit, catalog).attack).toBe(7);
    s = end(s);
    const v = viewUnit(s, "p1", s.players.p1.field[0] as Unit, catalog);
    expect([v.attack, v.exposed]).toEqual([4, true]);
  });
  it("陰謀論者：場にいる間、自分のターンの始めに山札が0枚なら勝ち", () => {
    let s = game(["plotter"]);
    s = play(s, 0, 0);
    s = end(s);
    expect(s.winner).toBeNull();
    s.players.p1.deck = [];
    const r = run(s, { type: "endTurn", player: "p2" });
    expect(r.state.winner).toBe("p1");
    expect(r.events).toContainEqual(expect.objectContaining({ type: "specialWin", player: "p1" }));
    // 山札が残っていれば勝ちにならない
    let t = game(["plotter"]);
    t = play(t, 0, 0);
    t = end(end(t), "p2");
    expect(t.winner).toBeNull();
  });
  it("破壊されたとき：倒れたキャラクターの持ち主の効果として働く（連鎖も落ち着くまで）", () => {
    let s = withFoe(["burner"], ["popper", "popper"]);
    s = play(s, 0, 0);
    const hand = s.players.p1.hand.length;
    // 相手の popper 2体を破壊すると、それぞれ p1 のキャラクターすべてに1ダメージ → burner が倒れて p1 が1枚引く
    for (const u of s.players.p2.field) if (u) u.damage = 1;
    s = end(s);
    expect(s.players.p2.field.every((u) => u === null)).toBe(true);
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p1.trash).toContain("burner");
    expect(s.players.p1.hand.length).toBeGreaterThan(hand);
  });
  it("破壊されたとき：相打ちで両方が破壊されたあとに、どのカードの効果かの印（deathTriggered）、続けてその効果が出る", () => {
    // p1 の f（1/1）が、相手の popper（1/1）と相打ち。popper の効果で p1 の wall に1ダメージ
    let s = withFoe(["f", "wall"], ["popper"]);
    s = play(s, 0, 0);
    s = play(s, 0, 1);
    s = end(end(s), "p2");
    const r = hit(s, 0, 0);
    const kinds = r.events.map((e) => e.type);
    expect(kinds).toEqual(["battle", "destroyed", "destroyed", "deathTriggered", "damaged"]);
    expect(r.events[3]).toEqual({ type: "deathTriggered", player: "p2", slot: 0, cardId: "popper", size: 1 });
    expect(r.events[4]).toMatchObject({ player: "p1", slot: 1, amount: 1 });
  });
  it("場のキャラクターが【破壊されたとき】を持つか（沈黙なら持たない）", () => {
    let s = withFoe(["note"], ["popper", "f"]);
    expect(viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog).deathEffect).toBe(true);
    expect(viewUnit(s, "p2", s.players.p2.field[1] as Unit, catalog).deathEffect).toBe(false);
    s = cast(s, 0, { side: "enemy", slot: 0 });
    expect(viewUnit(s, "p2", s.players.p2.field[0] as Unit, catalog).deathEffect).toBe(false);
  });
  it("クサハミ：場に出たあとに自分の草が破壊されても、攻撃力は増えない（場に出たときに確定した数字のまま）", () => {
    let s = game(["eater", "cat"]);
    s = play(s, 0, 0);
    s = play(s, 0, 1);
    for (const u of s.players.p1.field) if (u?.cardId === "kusa") u.damage = 1;
    const r = run(s, { type: "endTurn", player: "p1" });
    s = r.state;
    expect(s.players.p1.tokensLost).toEqual({ kusa: 2 });
    expect(r.events.filter((e) => e.type === "buffed")).toEqual([]);
    const eater = s.players.p1.field[0] as Unit;
    expect(eater.atkBuff).toBe(0);
    expect(viewUnit(s, "p1", eater, catalog).attack).toBe(1);
  });
  it("クサハミ：場に出たときに、それまでに破壊された草の数を数えて足す。強化なので、数字はあとから勝手に動かない", () => {
    let s = play(game(["cat", "eater"]), 0, 0);
    const grass = s.players.p1.field.findIndex((u) => u?.cardId === "kusa");
    (s.players.p1.field[grass] as Unit).damage = 1;
    s = end(end(s), "p2");
    expect(s.players.p1.tokensLost).toEqual({ kusa: 1 });
    s = play(
      s,
      s.players.p1.hand.indexOf("eater"),
      s.players.p1.field.findIndex((u) => !u),
    );
    const at = s.players.p1.field.findIndex((u) => u?.cardId === "eater");
    expect(viewUnit(s, "p1", s.players.p1.field[at] as Unit, catalog).attack).toBe(2);
    // 破壊された数をあとから書き換えても、攻撃力は変わらない（数字の元は強化だけ）
    s.players.p1.tokensLost = { kusa: 9 };
    expect(viewUnit(s, "p1", s.players.p1.field[at] as Unit, catalog).attack).toBe(2);
  });
  it("クサハミの闇の姿：闇堕ちしたときに、それまでに破壊された草の数を数えて攻撃力に足す", () => {
    let s = play(game(["eater"]), 0, 0);
    s.players.p1.tokensLost = { kusa: 3 };
    (s.players.p1.field[0] as Unit).damage = 3;
    s = end(s);
    expect(s.players.p1.field[0]).toBeNull();
    const r = run(end(s, "p2"), { type: "darkFall", player: "p1", slot: 0 });
    const dark = r.state.players.p1.field[0] as Unit;
    expect(dark.dark).toBe(true);
    expect(r.events).toContainEqual({
      type: "buffed",
      player: "p1",
      slot: 0,
      cardId: "eater",
      attack: 3,
      hp: 0,
    });
    expect(viewUnit(r.state, "p1", dark, catalog).attack).toBe(4);
  });
  it("本物のクサハミ（c14）：場に出たとき・闇堕ちしたときに確定した攻撃力は、あとで草が破壊されても変わらない", () => {
    const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
    const go = (s: GameState, a: Action) => applyAction(s, a, real);
    const field = (s: GameState) => s.players.p1.field;
    const attack = (s: GameState, slot: number) => viewUnit(s, "p1", field(s)[slot] as Unit, real).attack;
    const turn = (s: GameState) => {
      const r = go(go(s, { type: "endTurn", player: "p1" }).state, { type: "endTurn", player: "p2" }).state;
      r.players.p1.mana = 10;
      return r;
    };
    const playCard = (s: GameState, id: string) =>
      go(s, {
        type: "play",
        player: "p1",
        handIndex: s.players.p1.hand.indexOf(id),
        slot: field(s).findIndex((u) => !u),
      }).state;
    // 草は体力1。ダメージを1にしておくと、ターンの終わりに破壊される
    const killGrass = (s: GameState) => {
      const u = field(s).find((u) => u?.cardId === "t-kusa");
      if (u) u.damage = 1;
    };
    // 手札：猫ミーム（草を2体出す）・クサハミ・リプ欄の民（草を1体出す）
    let s = createGame({
      decks: { p1: ["k1", "c14", "k6", "k6", ...Array(16).fill("k6")], p2: Array(20).fill("k6") },
      seed: 42,
      shuffle: false,
      config: { startHand: 4 },
    });
    s.players.p1.mana = 10;
    s = playCard(s, "k1");
    killGrass(s);
    s = turn(s);
    expect(s.players.p1.tokensLost).toEqual({ "t-kusa": 1 });

    s = playCard(s, "c14");
    const at = field(s).findIndex((u) => u?.cardId === "c14");
    expect(attack(s, at)).toBe(3); // 2 ＋ 破壊された草 1
    killGrass(s);
    const r = go(s, { type: "endTurn", player: "p1" });
    expect(r.state.players.p1.tokensLost).toEqual({ "t-kusa": 2 });
    expect(r.events.filter((e) => e.type === "buffed")).toEqual([]);
    expect(attack(r.state, at)).toBe(3);

    // 闇堕ち：闇堕ちしたときに数え直して確定し、そのあとは増えない
    s = go(r.state, { type: "endTurn", player: "p2" }).state;
    s.players.p1.mana = 10;
    (field(s)[at] as Unit).damage = 2;
    s = turn(s);
    expect(field(s)[at]).toBeNull();
    s = go(s, { type: "darkFall", player: "p1", slot: at }).state;
    expect(field(s)[at]?.dark).toBe(true);
    expect(attack(s, at)).toBe(4); // 2 ＋ 破壊された草 2
    s = playCard(s, "k6");
    killGrass(s);
    const after = go(s, { type: "endTurn", player: "p1" });
    expect(after.state.players.p1.tokensLost).toEqual({ "t-kusa": 3 });
    expect(after.events.filter((e) => e.type === "buffed")).toEqual([]);
    expect(attack(after.state, at)).toBe(4);
  });
});

describe("差し出し（フィクサー）", () => {
  it("自分と相手がそれぞれ自分のキャラクターを1体選び、両方そろったら一度に破壊される。選ぶまでほかの操作はできない", () => {
    let s = withFoe(["wall", "fixer", "rush"], ["big", "guard"]);
    s = play(s, 0, 0);
    const r = run(s, { type: "play", player: "p1", handIndex: 0, slot: 1 });
    s = r.state;
    expect(r.events).toContainEqual({ type: "sacrificeAsk", player: "p1", waiting: ["p1", "p2"] });
    expect(() => play(s, 0, 2)).toThrow(/差し出す/);
    // フィクサー自身は選べない
    expect(() => run(s, { type: "sacrifice", player: "p1", slot: 1 })).toThrow(/選べません/);
    // 相手は自分の手番でなくても選べる
    s = run(s, { type: "sacrifice", player: "p2", slot: 1 }).state;
    expect(s.players.p2.field[1]).not.toBeNull();
    expect(() => run(s, { type: "sacrifice", player: "p2", slot: 0 })).toThrow(/もう選んで/);
    const done = run(s, { type: "sacrifice", player: "p1", slot: 0 });
    s = done.state;
    expect(s.pending).toBeNull();
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p1.field[1]?.cardId).toBe("fixer");
    expect(done.events.filter((e) => e.type === "sacrificed")).toHaveLength(2);
    // そのあとは普通に続けられる
    s = play(s, 0, 2);
    expect(s.players.p1.field[2]?.cardId).toBe("rush");
  });
  it("選べるキャラクターが無い側は選ばない。どちらにも無ければ何も起きない", () => {
    let s = withFoe(["fixer"], ["big"]);
    s = play(s, 0, 0);
    expect(s.pending?.waiting).toEqual(["p2"]);
    let t = game(["fixer"]);
    t = play(t, 0, 0);
    expect(t.pending ?? null).toBeNull();
  });
  it("CPU：自分の差し出しは闇堕ちを使っていない★5を優先し、相手の選ぶ番で手を止める", () => {
    let s = withFoe(["wall", "fixer"], ["big"]);
    s = play(s, 0, 0);
    const plan = planTurn(s, "p1", catalog);
    const at = plan.findIndex((a) => a.type === "play" && s.players.p1.hand[a.handIndex] === "fixer");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(plan[at + 1]).toEqual({ type: "sacrifice", player: "p1", slot: 0 });
    expect(plan.at(-1)?.type).toBe("sacrifice");
  });
});

describe("調停（『調停者』）", () => {
  it("場に出たとき、敵味方の場で攻撃力がいちばん高いキャラクターを破壊する", () => {
    let s = withFoe(["basher", "judge"], ["big", "wall"]);
    s = play(s, 0, 0);
    s = play(s, 0, 1);
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.cardId).toBe("wall");
    expect(s.players.p1.field[0]?.cardId).toBe("basher");
    expect(s.players.p1.field[1]?.cardId).toBe("judge");
  });
  it("いちばん高いのが自分のキャラクターでも破壊する。同じ攻撃力なら両方", () => {
    let s = withFoe(["big", "judge"], ["big", "wall"]);
    s = play(s, 0, 0);
    s = play(s, 0, 1);
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.cardId).toBe("wall");
  });
  it("このキャラクター自身は除く（自身がいちばん高くても、その次を斬る）", () => {
    let s = withFoe(["judge"], ["f"]);
    s = play(s, 0, 0);
    expect(s.players.p1.field[0]?.cardId).toBe("judge");
    expect(s.players.p2.field[0]).toBeNull();
  });
  it("裁きのダメージは出た直後に続けて出る。破壊されたキャラクターの【破壊されたとき】のダメージは、そのあと（画面の光線は前の分だけ）", () => {
    const s = withFoe(["judge"], ["flare", "f"]);
    const { state, events } = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    const types = events.map((e) => (e.type === "damaged" ? `damaged:${e.player}:${e.cardId}` : e.type));
    expect(types.slice(0, 3)).toEqual(["played", "damaged:p2:flare", "destroyed"]);
    // 炎上の 1 ダメージは『調停者』自身にも当たる（破壊はされない）
    expect(types).toContain("damaged:p1:judge");
    expect(types.indexOf("damaged:p1:judge")).toBeGreaterThan(types.indexOf("destroyed"));
    expect(state.players.p1.field[0]?.damage).toBe(1);
  });
});

describe("演出（『演出家』）", () => {
  // 闇堕ちを持つカード（テスト用のカタログから1枚選ぶ）
  const ace = Object.values(catalog).find((c) => c.dark && c.type === "icon")?.id as string;
  it("両方に空き枠があれば、それぞれの山札から闇堕ちを持つカードを1枚ずつ出す。場に出たときの効果は働かない", () => {
    let s = withFoe(["director"], ["f"]);
    s.players.p1.deck.unshift(ace);
    s.players.p2.deck.unshift(ace);
    const deckBefore = { p1: s.players.p1.deck.length, p2: s.players.p2.deck.length };
    const r = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    s = r.state;
    expect(s.players.p1.field[1]?.cardId).toBe(ace);
    expect(s.players.p2.field[1]?.cardId).toBe(ace);
    expect(s.players.p1.field[1]?.dark).toBe(false);
    expect(s.players.p1.deck.length).toBe(deckBefore.p1 - 1);
    expect(s.players.p2.deck.length).toBe(deckBefore.p2 - 1);
    expect(r.events.filter((e) => e.type === "summoned")).toHaveLength(2);
    // 場に出たときの効果（played の後の効果のイベント）は、出たエースからは起きない
    expect(r.events.filter((e) => e.type === "played")).toHaveLength(1);
  });
  it("出したキャラクターには突進が付く（相手のキャラクターにだけすぐ攻撃できる）。相手側のキャラクターは自分のターンには攻撃できず、相手のターンの始めに突進が外れる", () => {
    let s = withFoe(["director"], ["f"]);
    s.players.p1.deck.unshift(ace);
    s.players.p2.deck.unshift(ace);
    s = play(s, 0, 0);
    const mine = s.players.p1.field[1];
    expect(mine?.canAttack).toBe(true);
    expect(mine?.rushOnly).toBe(true);
    expect(attackTargets(s, "p1", 1, catalog).some((t) => t.kind === "leader")).toBe(false);
    s = run(s, { type: "attack", player: "p1", from: 1, target: { kind: "unit", slot: 0 } }).state;
    expect(() => run(s, { type: "attack", player: "p2", from: 1, target: { kind: "leader" } })).toThrow(
      /相手のターン/,
    );
    s = end(s);
    expect(s.players.p2.field[1]?.rushOnly).toBe(false);
  });
  it("どちらかの場が埋まっていれば、どちらにも出ない", () => {
    let s = withFoe(["director"], ["f", "f", "f", "f", "f"]);
    s.players.p1.deck.unshift(ace);
    s.players.p2.deck.unshift(ace);
    s = play(s, 0, 0);
    expect(s.players.p1.field.filter(Boolean)).toHaveLength(1);
    expect(s.players.p2.deck[0]).toBe(ace);
  });
  it("山札に闇堕ちを持つカードが無い側は出さない（もう片方は出す）", () => {
    let s = withFoe(["director"], ["f"]);
    s.players.p1.deck.unshift(ace);
    s.players.p2.deck = s.players.p2.deck.filter((id) => !catalog[id]?.dark);
    s = play(s, 0, 0);
    expect(s.players.p1.field[1]?.cardId).toBe(ace);
    expect(s.players.p2.field.filter(Boolean)).toHaveLength(1);
  });
});

describe("属性の効果", () => {
  it("眠り：相手の次のターンは攻撃できない", () => {
    let s = withFoe(["sleep"], ["big"]);
    s = cast(s, 0, { side: "enemy", slot: 0 });
    s = end(s);
    expect(() => run(s, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } })).toThrow(
      /眠って/,
    );
    s = end(end(s, "p2"));
    expect(
      run(s, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } }).state.players.p1.lp,
    ).toBe(14);
  });
  it("訂正：キーワードと効果を消し、攻撃力-2", () => {
    let s = withFoe(["note"], ["guard"]);
    s = cast(s, 0, { side: "enemy", slot: 0 });
    const v = viewUnit(s, "p2", s.players.p2.field[0] as never, catalog);
    expect(v.guard).toBe(false);
    expect(v.attack).toBe(0);
  });
  it("草を生やす・空き枠を埋める。トークンも破壊されたら墓地に行く（10月24日）", () => {
    let s = play(game(["cat", "meadow"]), 0, 0);
    expect(s.players.p1.field.filter((u) => u?.cardId === "kusa")).toHaveLength(2);
    s = cast(s, 0);
    expect(s.players.p1.field.every((u) => u)).toBe(true);
    s = end(s);
    s.players.p2.mana = 10;
    s = play(s, 0, 0, "p2");
    s = end(end(s, "p2"));
    s = run(s, { type: "attack", player: "p2", from: 0, target: { kind: "unit", slot: 1 } }).state;
    expect(s.players.p1.field[1]).toBeNull();
    expect(s.players.p1.trash).toContain("kusa");
  });
  it("コピー：同じキャラクターがもう1体出て、墓地には残らない", () => {
    const s = play(game(["copy"]), 0, 0);
    expect(s.players.p1.field.filter((u) => u?.cardId === "copy")).toHaveLength(2);
    expect(s.players.p1.field[1]?.token).toBe(true);
  });
  it("コンボ：このターンに出したほかのカード1枚につき攻撃力+1", () => {
    const s = play(play(play(game(["f", "f", "nori"]), 0, 0), 0, 1), 0, 2);
    expect(viewUnit(s, "p1", s.players.p1.field[2] as never, catalog).attack).toBe(4);
  });
  it("コラ画像：出たときに、自分の場のほかのキャラクター1体につき攻撃力+1。あとで仲間が減っても下がらない", () => {
    const s = play(play(play(game(["f", "f", "kora"]), 0, 0), 0, 1), 0, 2);
    const kora = s.players.p1.field[2] as Unit;
    expect(viewUnit(s, "p1", kora, catalog).attack).toBe(4);
    s.players.p1.field[0] = null;
    s.players.p1.field[1] = null;
    expect(viewUnit(s, "p1", kora, catalog).attack).toBe(4);
  });
  it("神：相手のガードをすべて消す／専門家：いちばん強い相手に3ダメージ", () => {
    let s = withFoe(["kami", "expert"], ["guard", "big"]);
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "leader" });
    s.players.p1.mana = 10;
    s = play(s, 0, 1);
    expect(s.players.p2.field[1]?.damage).toBe(3);
  });
  it("癒し：キャラクターとライフを回復する（ライフは20まで）", () => {
    let s = play(game(["wall", "healer"]), 0, 0);
    const wall = s.players.p1.field[0];
    if (wall) wall.damage = 5;
    s.players.p1.lp = 19;
    s = play(s, 0, 1);
    expect(s.players.p1.field[0]?.damage).toBe(3);
    expect(s.players.p1.lp).toBe(20);
  });
  it("ファンサ：自分のキャラクター1体に攻撃力+2・体力+2", () => {
    let s = play(game(["f", "fansa"]), 0, 0);
    s = cast(s, 0, { side: "ally", slot: 0 });
    const v = viewUnit(s, "p1", s.players.p1.field[0] as never, catalog);
    expect([v.attack, v.maxHp]).toEqual([3, 3]);
  });
});

describe("バトルと闇堕ち", () => {
  it("お互いの攻撃力の分だけ体力が減り、ダメージは残る", () => {
    let s = withFoe(["twin"], ["wall"]);
    s = play(s, 0, 0);
    const r = hit(s, 0, 0);
    expect(r.events[0]).toMatchObject({ type: "battle", toDefender: 2, toAttacker: 1 });
    s = end(end(r.state), "p2");
    expect(s.players.p2.field[0]?.damage).toBe(2);
  });
  it("闇堕ちを持つカードは、破壊されたらいったん墓地へ行き、裏向きのカードが残る（すぐには戻らない）", () => {
    let s = withFoe(["big"], ["ren"]);
    s = play(s, 0, 0);
    s = end(end(s), "p2");
    const r = hit(s, 0, 0);
    expect(r.events.map((e) => e.type)).not.toContain("darkFall");
    expect(r.events).toContainEqual({ type: "darkOmen", player: "p2", slot: 0, cardId: "ren" });
    expect(r.state.players.p2.field[0]).toBeNull();
    expect(r.state.players.p2.trash).toContain("ren");
    expect(darkOmens(r.state, "p2")).toEqual([
      { cardId: "ren", slot: 0, turn: r.state.turn, ownTurns: r.state.players.p2.turnsTaken },
    ]);
  });
  it("ライフが0になったら勝ち、以降は操作できない", () => {
    let s = play(game(["twin"]), 0, 0);
    s.players.p2.lp = 4;
    s = face(face(s, 0).state, 0).state;
    expect(s.winner).toBe("p1");
    expect(() => end(s)).toThrow(/終了/);
  });
});

describe("CPU", () => {
  const real = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  it("合法な操作だけでターンを終える", () => {
    const s = createGame({
      decks: { p1: DECKS.solo_flame, p2: DECKS.solo_idol },
      seed: 3,
    });
    const plan = planTurn(s, "p1", real);
    let cur = s;
    for (const a of plan) cur = applyAction(cur, a, real).state;
    expect(plan.at(-1)).toEqual({ type: "endTurn", player: "p1" });
  });
  it("すべてのデッキどうしで最後まで対戦でき、必ず決着がつく", () => {
    const ids = Object.keys(DECKS) as (keyof typeof DECKS)[];
    for (const a of ids)
      for (const b of ids)
        for (const seed of [1, 2]) {
          let s = createGame({
            decks: { p1: DECKS[a], p2: DECKS[b] },
            seed,
          });
          for (let t = 0; t < 100 && !s.winner; t++) {
            // 『フィクサー』の差し出し待ちは、待っている人が選んでから続ける
            while (s.pending && !s.winner) {
              const who = s.pending.waiting[0] ?? s.active;
              s = applyAction(
                s,
                { type: "sacrifice", player: who, slot: autoSacrifice(s, who, real) },
                real,
              ).state;
            }
            for (const x of planTurn(s, s.active, real)) s = applyAction(s, x, real).state;
          }
          expect(s.winner).not.toBeNull();
        }
    // 5 デッキ × 5 × 2 = 50 試合
  }, 60_000);
});

describe("デッキの決まり", () => {
  const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
  it("構築済みデッキはすべて決まりを守っている（属性1つ＋ニュートラル）", () => {
    for (const [id, deck] of Object.entries(DECKS)) {
      expect({ id, errors: validateDeck(deck, real) }).toEqual({ id, errors: [] });
      expect(deckAttributes(deck, real)).toHaveLength(1);
    }
  });
  it("属性が2つ以上・枚数違い・3枚目・トークンは反則", () => {
    const two = [...Array(2).fill("f6"), ...Array(2).fill("m6")];
    const errors = validateDeck([...two, "t-kusa", "f6"], real);
    expect(errors.some((e) => e.includes("20枚"))).toBe(true);
    expect(errors.some((e) => e.includes("属性は1つまで"))).toBe(true);
    expect(errors.some((e) => e.includes("トークン"))).toBe(true);
    expect(errors.some((e) => e.includes("2枚まで"))).toBe(true);
  });
  it("デッキの指し方：構築済みの ID か custom:（カード ID をカンマでつなぐ）", () => {
    expect(resolveDeckRef("solo_flame", DECKS)).toEqual(DECKS.solo_flame);
    const ref = encodeCustomDeck(DECKS.solo_idol);
    expect(ref.startsWith("custom:")).toBe(true);
    expect(resolveDeckRef(ref, DECKS)).toEqual(DECKS.solo_idol);
    expect(resolveDeckRef("nope", DECKS)).toBeNull();
    expect(resolveDeckRef("custom:", DECKS)).toBeNull();
    expect(resolveDeckRef("custom:f1,../x", DECKS)).toBeNull();
    expect(resolveDeckRef(42, DECKS)).toBeNull();
  });
  it("ニュートラルのカードは属性に数えない", () => {
    expect(deckAttributes(["n5", "n2", "f6"], real)).toEqual(["炎"]);
  });
  it("1つの属性＋ニュートラルのカードの20枚は組める（ニュートラルのカードだけでもよい）。闇堕ちを持つカードは種類を問わず2枚まで、★5は何種類でも", () => {
    const flame = DECKS.solo_flame;
    expect(validateDeck(flame, real)).toEqual([]);
    const swap = (from: string, to: string) => {
      const d = [...flame];
      d.splice(d.indexOf(from), 1, to);
      return d;
    };
    // 闇堕ちを持つカードを2種類1枚ずつ（レン・カグラ）は組める
    const twoKinds = swap("c2", "c9");
    expect(twoKinds.filter((id) => real[id]?.dark).sort()).toEqual(["c2", "c9"]);
    expect(validateDeck(twoKinds, real)).toEqual([]);
    // 3枚（レン2枚＋カグラ）は反則
    const threeDark = swap("f1", "c9");
    expect(validateDeck(threeDark, real).some((e) => e.includes("闇堕ちを持つカードは2枚まで"))).toBe(true);
    // 闇堕ちのない★5（ヒバナ）や共通の★5（『フィクサー』『演出家』）は数えない
    expect(flame.filter((id) => id === "c4")).toHaveLength(2);
    expect(validateDeck(swap("f1", "c17"), real)).toEqual([]);
    const commons = ["n2", "n3", "n5", "n6", "n8", "n9", "n10", "n11", "n12", "n13"].flatMap((id) => [
      id,
      id,
    ]);
    expect(validateDeck(commons, real)).toEqual([]);
  });
  it("構築済みデッキは単属性で、5属性に1つずつある（ほかに『フィクサー』が主役の草のデッキと、運営サイドの★5 3枚のデッキ）", () => {
    const solo = Object.entries(DECKS).filter(([id]) => id.startsWith("solo_"));
    const attrs = solo.map(([, d]) => deckAttributes(d, real).join("×"));
    expect([...attrs].sort()).toEqual([...ATTRIBUTES].sort());
    expect(deckAttributes(DECKS.fixer_meme, real)).toEqual(["自然"]);
    expect(DECKS.fixer_meme.filter((c) => c === "c15")).toHaveLength(2);
    expect(deckAttributes(DECKS.unei_idol, real)).toEqual(["推し"]);
    for (const id of ["c15", "c16", "c17"]) expect(DECKS.unei_idol.filter((c) => c === id)).toHaveLength(2);
  });
  it("構築済みデッキは、エース（闇堕ちを持つカード）を1種類2枚、ニュートラルのカードを4枚入れる（運営デッキ・推しデッキ・炎デッキ・神デッキ・水デッキ・自然の2デッキは例外）", () => {
    // 運営デッキ（unei_）は、共通で固めるのがコンセプト（オーナー）なので、共通の枚数の決まりから外す
    expect(DECKS.unei_idol.filter((c) => real[c]?.attributes.length === 0)).toHaveLength(14);
    // 推しデッキは、運営サイドの3枚とインフルエンサー・スクショで、ニュートラル8枚（10月24日、docs/design-oshi.md）
    expect(DECKS.solo_idol.filter((c) => real[c]?.attributes.length === 0)).toHaveLength(8);
    // 炎デッキは、『フィクサー』『調停者』の2枚だけ（10月24日、docs/design-fire.md）
    expect(DECKS.solo_flame.filter((c) => real[c]?.attributes.length === 0)).toEqual(["c15", "c16"]);
    // 水デッキはライブ配信の2枚だけ（10月24日、docs/design-water.md）
    expect(DECKS.solo_heal.filter((c) => real[c]?.attributes.length === 0)).toEqual(["n17", "n17"]);
    // 神デッキは『調停者』の2枚だけ（10月25日、docs/design-god.md）
    expect(DECKS.solo_expert.filter((c) => real[c]?.attributes.length === 0)).toEqual(["c16", "c16"]);
    // 自然の全体強化デッキは自然だけ、クサハミデッキはスクショと『フィクサー』『調停者』の5枚（10月25日、docs/design-nature.md）
    expect(DECKS.solo_meme.filter((c) => real[c]?.attributes.length === 0)).toEqual([]);
    expect(DECKS.fixer_meme.filter((c) => real[c]?.attributes.length === 0)).toEqual([
      "n9",
      "n9",
      "c15",
      "c15",
      "c16",
    ]);
    for (const [id, deck] of Object.entries(DECKS)) {
      if (
        id.startsWith("unei_") ||
        ["solo_idol", "solo_flame", "solo_expert", "solo_heal", "solo_meme", "fixer_meme"].includes(id)
      )
        continue;
      const aces = deck.filter((c) => real[c]?.dark);
      const commons = deck.filter((c) => real[c]?.attributes.length === 0);
      expect({ id, aces: aces.length, kinds: new Set(aces).size, commons: commons.length }).toEqual({
        id,
        aces: 2,
        kinds: 1,
        commons: 4,
      });
    }
  });
});

describe("第2弾の効果", () => {
  it("条件付き：自分の場に炎上が2体以上いるときだけ強化される", () => {
    let s = play(game(["rider"]), 0, 0);
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog).attack).toBe(2);
    s = play(play(game(["flamer", "rider"]), 0, 0), 0, 1);
    expect(viewUnit(s, "p1", s.players.p1.field[1] as never, catalog).attack).toBe(3);
  });
  it("ほかのキャラクターすべてを強化する（自分は含まない）", () => {
    const s = play(play(game(["f", "host"]), 0, 0), 0, 1);
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog).attack).toBe(2);
    expect(viewUnit(s, "p1", s.players.p1.field[1] as never, catalog).attack).toBe(3);
  });
  it("相手のキャラクターすべてと相手のプレイヤーにダメージ", () => {
    let s = withFoe(["queen"], ["f", "wall"]);
    s = play(s, 0, 0);
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.damage).toBe(2);
    expect(s.players.p2.lp).toBe(18);
  });
  it("呪文で相手のプレイヤーにダメージ", () => {
    const s = cast(game(["burn"]), 0);
    expect(s.players.p2.lp).toBe(17);
  });
  it("相手のキャラクターすべて／いちばん強い1体を眠り状態にする", () => {
    let s = withFoe(["voice"], ["f", "big"]);
    s = end(play(s, 0, 0));
    expect(() => run(s, { type: "attack", player: "p2", from: 1, target: { kind: "leader" } })).toThrow(
      RuleError,
    );
    let t = withFoe(["asmr"], ["f", "big"]);
    t = end(play(t, 0, 0));
    expect(() => run(t, { type: "attack", player: "p2", from: 1, target: { kind: "leader" } })).toThrow(
      RuleError,
    );
    expect(
      run(t, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } }).state.players.p1.lp,
    ).toBe(19);
  });
});

describe("切り札の効果（★4〜5）", () => {
  it("晒し：強化（プラスの分）が消える。体力の強化が消えて倒れることもある", () => {
    let s = withFoe(["expose", "expose"], ["f", "f"]);
    const a = s.players.p2.field[0] as never as { atkBuff: number; hpBuff: number; damage: number };
    Object.assign(a, { atkBuff: 3, hpBuff: 2 });
    Object.assign(s.players.p2.field[1] as object, { hpBuff: 2, damage: 2 });
    s = cast(s, 0, { side: "enemy", slot: 0 });
    expect(s.players.p2.field[0]).toMatchObject({ atkBuff: 0, hpBuff: 0 });
    s = cast(s, 0, { side: "enemy", slot: 1 });
    expect(s.players.p2.field[1]).toBeNull();
  });
  it("相手のキャラクターを破壊するたび、もう1回攻撃できる", () => {
    let s = play(withFoe(["chain"], ["f", "f"]), 0, 0);
    s = hit(s, 0, 0).state;
    s = hit(s, 0, 1).state;
    expect(s.players.p2.field.every((u) => !u)).toBe(true);
    // 2体目を破壊した分の攻撃も残っている。プレイヤーへの攻撃では増えない
    s = face(s, 0).state;
    expect(s.players.p2.lp).toBe(18);
    expect(() => face(s, 0)).toThrow(RuleError);
  });
  it("センターのトップアイドル：自分のほかのキャラクターもターンの始めに伸びる", () => {
    let s = play(play(game(["aura", "f"]), 0, 2), 0, 0);
    s = end(end(s), "p2");
    expect(s.players.p1.field[2]?.atkBuff).toBe(2);
    expect(s.players.p1.field[0]?.atkBuff).toBe(1);
  });
  it("推し変：攻撃力が条件以下の相手のキャラクターを奪う。奪ったターンは攻撃できない", () => {
    const s = play(withFoe(["thief"], ["big", "f"]), 0, 0);
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p1.field[1]?.cardId).toBe("f");
    expect(() => face(s, 1)).toThrow(RuleError);
  });
  it("子守唄：相手のターンの始めに、相手の攻撃力がいちばん高いキャラクターが眠る", () => {
    let s = play(withFoe(["lull"], ["f", "big"]), 0, 0);
    s = end(s);
    expect(() => run(s, { type: "attack", player: "p2", from: 1, target: { kind: "leader" } })).toThrow(
      /眠って/,
    );
    expect(
      run(s, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } }).state.players.p1.lp,
    ).toBe(19);
  });
  it("ターンの終わりに働く効果（カードを引く）", () => {
    const s = play(game(["reader"]), 0, 0);
    const before = s.players.p1.hand.length;
    expect(end(s).players.p1.hand.length).toBe(before + 1);
  });
  it("場のキャラクターの数だけ安くなり、出たときに全員すぐ攻撃でき、ガードを無視できる", () => {
    let s = withFoe(["f", "f", "f", "swarm"], ["guard"]);
    s = play(play(play(s, 0, 0), 0, 1), 0, 2);
    expect(effectiveCost(s, "p1", "swarm", catalog)).toBe(6);
    s = play(s, 0, 3);
    expect(s.players.p1.mana).toBe(10 - 3 - 6);
    s = face(s, 0).state;
    expect(s.players.p2.lp).toBe(20 - 3);
  });
  it("使った呪文の数だけ安くなり、出したあとにもう一度自分のターン", () => {
    let s = game(["scholar"]);
    s.players.p1.postsUsed = 9;
    expect(effectiveCost(s, "p1", "scholar", catalog)).toBe(3);
    s = play(s, 0, 0);
    const turn = s.turn;
    s = end(s);
    expect(s.active).toBe("p1");
    expect(s.turn).toBe(turn + 1);
    expect(end(s).active).toBe("p2");
  });
  it("回復の効果を使うたび：数を数え、healGrow は強くなり、healBurn は相手のプレイヤーにダメージ", () => {
    let s = play(game(["dj", "sauna", "therapy", "yuru"], F(12), 20), 0, 0);
    // ととのい師：自分の登場の回復で、もう2ダメージ
    s = play(s, 0, 1);
    expect(s.players.p1.heals).toBe(1);
    expect(s.players.p2.lp).toBe(20 - 2);
    const dj = s.players.p1.field[0];
    expect(dj && viewUnit(s, "p1", dj, catalog).attack).toBe(3);
    // 満タンでも回復の効果を使えば数える
    s = applyAction(s, { type: "cast", player: "p1", handIndex: 0 }, catalog).state;
    expect(s.players.p1.heals).toBe(2);
    expect(s.players.p2.lp).toBe(20 - 4);
    const dj2 = s.players.p1.field[0];
    expect(dj2 && viewUnit(s, "p1", dj2, catalog).attack).toBe(4);
    // ゆるキャラは回復の回数だけ安くなる
    expect(effectiveCost(s, "p1", "yuru", catalog)).toBe(8 - 2);
  });
  it("回復の効果を使うたび：healStrike は攻撃力がいちばん高い相手のキャラクター1体にダメージ", () => {
    let s = play(withFoe(["shiba", "pet"], ["f", "big"]), 0, 0);
    s = play(s, 0, 1);
    const big = s.players.p2.field[1];
    expect(big?.damage).toBe(1);
    expect(s.players.p2.field[0]?.damage).toBe(0);
  });
  it("破壊されたとき：ライフの回復（回復の回数にも数える）・草を出す", () => {
    let s = game(["hamster", "sprout", "f"]);
    s.players.p1.lp = 10;
    s = play(s, 0, 0);
    // 体力を削っておき、次にカードを出したときの片付けで倒れる
    const ham = s.players.p1.field[0];
    if (ham) ham.damage = 2;
    s = play(s, 0, 1);
    expect(s.players.p1.field[0]?.cardId).not.toBe("hamster");
    expect(s.players.p1.lp).toBe(13);
    expect(s.players.p1.heals).toBe(1);
    const sp = s.players.p1.field[1];
    if (sp) sp.damage = 1;
    s = play(s, 0, 4);
    expect(s.players.p1.field.filter((u) => u?.cardId === "kusa").length).toBe(2);
  });
  it("破壊されたとき、相手のキャラクターすべてにダメージ", () => {
    let s = play(withFoe(["flare"], ["f", "wall"]), 0, 0);
    s = end(s);
    const atk = s.players.p2.field[1];
    if (atk) Object.assign(atk, { canAttack: true, attacksLeft: 1, atkBuff: 5 });
    s = run(s, { type: "attack", player: "p2", from: 1, target: { kind: "unit", slot: 0 } }).state;
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.damage).toBe(2 + 1);
  });
  it("自分のターンの終わりに、自分のほかのキャラクター1体（ランダム）に攻撃力+1", () => {
    let s = play(play(game(["leader", "wall"]), 0, 0), 0, 1);
    s = end(s);
    expect(s.players.p1.field[1]?.atkBuff).toBe(1);
    expect(s.players.p1.field[0]?.atkBuff).toBe(0);
  });
  it("突進で攻撃したとき、草を出す", () => {
    let s = play(withFoe(["pup"], ["wall"]), 0, 2);
    s = run(s, { type: "attack", player: "p1", from: 2, target: { kind: "unit", slot: 0 } }).state;
    expect(s.players.p1.field.filter((u) => u?.cardId === "kusa").length).toBe(1);
  });
  it("体力が1以下の相手のキャラクターをすべて破壊する", () => {
    const s = play(withFoe(["sweeper"], ["f", "wall", "f"]), 0, 0);
    expect(s.players.p2.field.map((u) => u?.cardId ?? null)).toEqual([null, "wall", null, null, null]);
  });
  it("蘇生：墓地のコスト以下のキャラクターのうち、いちばんコストが高いものが場に戻る（呪文・高いものは選ばない）", () => {
    const s = game(["nurse"]);
    s.players.p1.trash = ["big", "wall", "block", "pet"];
    const r = run(s, { type: "play", player: "p1", handIndex: 0, slot: 2 });
    expect(r.events).toContainEqual({ type: "revived", player: "p1", cardId: "wall", slot: 0 });
    expect(r.state.players.p1.field[0]?.cardId).toBe("wall");
    expect(r.state.players.p1.trash).toEqual(["big", "block", "pet"]);
    // 戻ったターンは攻撃できない
    expect(() => face(r.state, 0)).toThrow(RuleError);
  });
  it("変身：相手のキャラクターが草（トークン）になる。元のカードは墓地にも手札にも行かない", () => {
    const s = cast(withFoe(["meme"], ["big", "f"]), 0, { side: "enemy", slot: 0 });
    const u = s.players.p2.field[0];
    expect(u?.cardId).toBe("kusa");
    expect(u?.token).toBe(true);
    expect(s.players.p2.trash).not.toContain("big");
    expect(s.players.p2.hand).not.toContain("big");
    expect(s.players.p2.field[1]?.cardId).toBe("f");
  });
  it("場のキャラクター2体につき1枚引く（最大3枚）。トークンも数える", () => {
    let s = play(play(game(["cat", "f", "replies", "replies"]), 0, 0), 0, 3);
    // cat ＋ 草2体 ＋ f ＝ 4体 → 2枚
    expect(s.players.p1.field.filter((u) => u).length).toBe(4);
    const before = s.players.p1.hand.length;
    s = cast(s, 0);
    expect(s.players.p1.hand.length).toBe(before - 1 + 2);
  });
  it("相手のキャラクターすべての攻撃力を下げる（0より下にはならない）", () => {
    const s = play(withFoe(["gloom"], ["big", "f"]), 0, 0);
    const foe = s.players.p2;
    expect(viewUnit(s, "p2", foe.field[0] as Unit, catalog).attack).toBe(4);
    expect(viewUnit(s, "p2", foe.field[1] as Unit, catalog).attack).toBe(0);
  });
  it("蘇生で戻ったカードの「場に出たとき」も働く。戻せるものが無ければ何も起きない", () => {
    const s = game(["nurse", "nurse"]);
    s.players.p1.trash = ["pet", "block"];
    s.players.p1.lp = 10;
    let r = run(s, { type: "play", player: "p1", handIndex: 0, slot: 2 });
    expect(r.state.players.p1.field[0]?.cardId).toBe("pet");
    expect(r.state.players.p1.lp).toBe(13);
    expect(r.state.players.p1.heals).toBe(1);
    r = run(r.state, { type: "play", player: "p1", handIndex: 0, slot: 3 });
    expect(r.events.some((e) => e.type === "revived")).toBe(false);
    expect(r.state.players.p1.trash).toEqual(["block"]);
  });
});

describe("闇堕ち（破壊された次の自分のターンの始めに、自動で）", () => {
  /** p1 の場の slot のキャラクターを、p2 の big で破壊する（p2 の番）。破壊したあと p2 の番のまま返す */
  function killOnFoeTurn(s: GameState, slot = 0): GameState {
    s = end(s);
    s.players.p2.mana = 30;
    s.players.p2.hand = ["big", "big", ...s.players.p2.hand];
    s.players.p2.field = s.players.p2.field.map(() => null);
    s = play(play(s, 0, 0, "p2"), 0, 1, "p2");
    s.players.p2.field.forEach((u) => {
      if (u) Object.assign(u, { canAttack: true, attacksLeft: 1 });
    });
    for (const from of [0, 1])
      if (s.players.p1.field[slot])
        s = run(s, { type: "attack", player: "p2", from, target: { kind: "unit", slot } }).state;
    return s;
  }

  it("★5も手札から普通に出す。場にいる間は裏向きのカードはない", () => {
    const s = play(game(["ren"]), 0, 2);
    expect(s.players.p1.field[2]?.cardId).toBe("ren");
    expect(darkOmens(s, "p1")).toEqual([]);
  });

  it("破壊されたら裏向きのカードがその枠に残る。自分のターンに闇堕ちさせると、コストなしで闇堕ちの姿で出て、闇堕ちしたときの効果が働く", () => {
    let s = play(game(["ren"]), 0, 3);
    s = killOnFoeTurn(s, 3);
    expect(s.players.p1.field[3]).toBeNull();
    expect(darkOmens(s, "p1")).toEqual([
      { cardId: "ren", slot: 3, turn: s.turn, ownTurns: s.players.p1.turnsTaken },
    ]);
    // 自分のターンが来ても、自動では戻らない（10月26日に「自動で戻る」から変更）
    const started = run(s, { type: "endTurn", player: "p2" });
    expect(started.events.map((e) => e.type)).not.toContain("darkFall");
    s = started.state;
    expect(s.players.p1.field[3]).toBeNull();
    const mana = s.players.p1.mana;
    const r = run(s, { type: "darkFall", player: "p1", slot: 3 });
    s = r.state;
    expect(r.events.map((e) => e.type)).toContain("darkFall");
    expect(s.players.p1.mana).toBe(mana);
    expect(s.players.p1.trash).not.toContain("ren");
    expect(darkOmens(s, "p1")).toEqual([]);
    const u = s.players.p1.field[3];
    expect(viewUnit(s, "p1", u as never, catalog)).toMatchObject({ attack: 7, hp: 3, name: "闇堕ちレン" });
    // 闇堕ちしたとき：相手のキャラクターすべてに1ダメージ
    expect(s.players.p2.field.filter((x) => x).every((x) => (x?.damage ?? 0) >= 1)).toBe(true);
  });

  it("闇堕ちの姿は、出たターンから相手のキャラクターに攻撃できる（突進。プレイヤーは次のターンから）", () => {
    let s = withFoe(["ren"], ["wall"]);
    s = play(s, 0, 0);
    s = fall(end(killOnFoeTurn(s), "p2"), 0);
    const u = s.players.p1.field[0];
    expect(u?.dark).toBe(true);
    expect(u?.canAttack).toBe(true);
    expect(u?.attacksLeft).toBe(2); // 連撃
    const targets = attackTargets(s, "p1", 0, catalog);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.kind === "unit")).toBe(true);
    expect(() => face(s, 0)).toThrow();
    s = end(end(s), "p2");
    expect(attackTargets(s, "p1", 0, catalog)).toContainEqual({ kind: "leader" });
  });

  it("裏向きのカードが残ったターンは闇堕ちできない（自分のターンに破壊されたら、次の自分のターンから）", () => {
    let s = withFoe(["ren"], ["big"]);
    s = play(s, 0, 0);
    const mine = s.players.p1.field[0] as Unit;
    s.players.p1.field[0] = { ...mine, canAttack: true, attacksLeft: 1 };
    s = hit(s, 0, 0).state;
    expect(s.players.p1.field[0]).toBeNull();
    expect(darkOmens(s, "p1")).toHaveLength(1);
    expect(darkFallSlots(s, "p1")).toEqual([]);
    expect(() => fall(s, 0)).toThrow("破壊されたターンは、闇堕ちできません");
    s = end(s);
    // 相手のターンには闇堕ちできない
    expect(darkFallSlots(s, "p1")).toEqual([]);
    expect(() => fall(s, 0)).toThrow("相手のターンです");
    s = end(s, "p2");
    expect(s.players.p1.field[0]).toBeNull();
    expect(darkFallSlots(s, "p1")).toEqual([0]);
    expect(fall(s, 0).players.p1.field[0]?.dark).toBe(true);
  });

  it("裏向きのカードは、持ち主のターンが始まったら闇堕ちできるようになり、相手のターンでもそのまま", () => {
    const awake = (s: GameState) => darkOmenAwake(s, "p1", darkOmens(s, "p1")[0] as DarkOmen);
    // 自分のターンに破壊された：そのターンと相手のターンはまだ。次の自分のターンから
    let s = withFoe(["ren"], ["big"]);
    s = play(s, 0, 0);
    const mine = s.players.p1.field[0] as Unit;
    s.players.p1.field[0] = { ...mine, canAttack: true, attacksLeft: 1 };
    s = hit(s, 0, 0).state;
    expect(awake(s)).toBe(false);
    s = end(s);
    expect(awake(s)).toBe(false);
    s = end(s, "p2");
    expect(awake(s)).toBe(true);
    // 闇堕ちさせずにターンを終えても、相手のターンのあいだ闇堕ちできる印のまま（押せるのは自分のターンだけ）
    s = end(s);
    expect(awake(s)).toBe(true);
    expect(darkFallSlots(s, "p1")).toEqual([]);
    // 相手のターンに破壊された：次の自分のターンから
    let t = play(game(["ren"]), 0, 0);
    t = killOnFoeTurn(t, 0);
    expect(awake(t)).toBe(false);
    t = end(t, "p2");
    expect(awake(t)).toBe(true);
  });

  it("前の版の裏向きのカード（持ち主のターンの数が無い）も、手番の交代から闇堕ちできるか分かる", () => {
    const s = game([]);
    const old = { cardId: "ren", slot: 0, turn: s.turn };
    expect(darkOmenAwake(s, "p1", old)).toBe(false);
    expect(darkOmenAwake(end(s), "p1", old)).toBe(false);
    expect(darkOmenAwake(end(end(s), "p2"), "p1", old)).toBe(true);
  });

  it("闇堕ちは自分のターンの好きなときにできる。しなければ裏向きのカードは残り続ける", () => {
    let s = play(game(["ren", "f"]), 0, 0);
    s = end(killOnFoeTurn(s, 0), "p2");
    s.players.p1.mana = 10;
    s = play(s, s.players.p1.hand.indexOf("f"), 1);
    s = end(end(s), "p2");
    expect(darkOmens(s, "p1")).toHaveLength(1);
    expect(fall(s, 0).players.p1.field[0]?.dark).toBe(true);
  });

  it("裏向きのカードがない枠では闇堕ちできない", () => {
    expect(() => fall(game([]), 0)).toThrow("その場所に裏向きのカードはありません");
  });

  it("裏向きのカードは枠をふさぐ：その枠には出せず、効果で出すキャラクターもほかの枠へ", () => {
    let s = game(["f", "f"]);
    s.players.p1.trash = ["ren"];
    s.players.p1.darkOmens = [{ cardId: "ren", slot: 0, turn: 0 }];
    s.players.p1.mana = 10;
    expect(() => play(s, 0, 0)).toThrow("裏向きのカードがある場所には出せません");
    expect(openSlots(s, "p1")).toEqual([1, 2, 3, 4]);
    s = play(s, 0, 1);
    expect(s.players.p1.field[1]?.cardId).toBe("f");
  });

  it("闇堕ちの姿が破壊されたら消える（墓地にも行かず、もう戻らない）", () => {
    let s = play(game(["ren"]), 0, 0);
    s = fall(end(killOnFoeTurn(s), "p2"), 0);
    expect(s.players.p1.field[0]?.dark).toBe(true);
    const r = run(killOnFoeTurn(s), { type: "endTurn", player: "p2" });
    expect(r.state.players.p1.field[0]).toBeNull();
    expect(r.state.players.p1.trash).not.toContain("ren");
    expect(darkOmens(r.state, "p1")).toEqual([]);
  });

  it("闇堕ちの姿が破壊されたときの出来事は「消えた」", () => {
    let s = play(game(["ren"]), 0, 0);
    s = fall(end(killOnFoeTurn(s), "p2"), 0);
    s = end(s);
    s.players.p2.mana = 30;
    s.players.p2.hand = ["kill", ...s.players.p2.hand];
    const r = run(s, { type: "cast", player: "p2", handIndex: 0 });
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "destroyed", player: "p1", cardId: "ren", vanished: true }),
    );
  });

  it("TL浄化で元の姿に戻ったカードは、破壊されたら墓地へ行くが、もう闇堕ちしない", () => {
    let s = play(game(["ren", "cleanse"]), 0, 0);
    s = fall(end(killOnFoeTurn(s), "p2"), 0);
    s.players.p1.mana = 10;
    s = cast(s, 0);
    expect(s.players.p1.field[0]?.dark).toBe(false);
    s = killOnFoeTurn(s);
    expect(s.players.p1.trash).toContain("ren");
    expect(darkOmens(s, "p1")).toEqual([]);
  });

  it("同じカードが2枚あれば、それぞれ闇堕ちする（回数の決まりはない）", () => {
    let s = game([]);
    s.players.p1.trash = ["ren", "ren"];
    s.players.p1.darkOmens = [
      { cardId: "ren", slot: 0, turn: 0 },
      { cardId: "ren", slot: 1, turn: 0 },
    ];
    s = fall(fall(end(end(s), "p2"), 0), 1);
    expect(s.players.p1.field.filter((u) => u?.dark)).toHaveLength(2);
    expect(s.players.p1.trash).toEqual([]);
  });

  it("墓地から無くなったカード（蘇生など）の裏向きのカードは消え、枠が空く", () => {
    const s = game(["f"]);
    s.players.p1.darkOmens = [{ cardId: "ren", slot: 0, turn: 0 }];
    s.players.p1.mana = 10;
    const t = play(s, 0, 1);
    expect(darkOmens(t, "p1")).toEqual([]);
    expect(openSlots(t, "p1")).toContain(0);
  });

  it("CPU は、闇堕ちさせられる裏向きのカードがあれば、まず闇堕ちさせる", () => {
    let s = play(game(["ren"]), 0, 2);
    s = end(killOnFoeTurn(s, 2), "p2");
    expect(planTurnSearch(s, "p1", catalog)[0]).toEqual({ type: "darkFall", player: "p1", slot: 2 });
    expect(planTurn(s, "p1", catalog)[0]).toEqual({ type: "darkFall", player: "p1", slot: 2 });
  });
});

describe("バズ（1試合2回・自分のキャラクター1体に+2/+2と突進）", () => {
  /** 自分の n ターン目まで進めた盤面（p1 が先攻） */
  function atTurn(n: number, hand: string[], foe: string[] = []): GameState {
    let s = withFoe(hand, foe);
    for (let i = 2; i < n; i++) s = end(end(s), "p2");
    s.players.p1.mana = 10;
    return s;
  }
  const buzz = (s: GameState, slot: number, player: "p1" | "p2" = "p1") =>
    run(s, { type: "buzz", player, slot });

  it("先攻は自分の4ターン目から、後攻は3ターン目から使える", () => {
    let s = atTurn(3, ["f"]);
    s = play(s, 0, 0);
    expect(buzzBlock(s, "p1")).toMatch(/4ターン目/);
    expect(() => buzz(s, 0)).toThrow(/4ターン目/);
    s = end(end(s), "p2");
    expect(buzzBlock(s, "p1")).toBeNull();
    // 後攻：自分の3ターン目から
    let t = withFoe([], ["f"]);
    t = end(t);
    expect(buzzBlock(t, "p2")).toMatch(/3ターン目/);
    t = end(end(t, "p2"));
    expect(buzzBlock(t, "p2")).toBeNull();
  });

  it("+2/+2 と突進。出したばかりのキャラクターも、相手のキャラクターに攻撃できる", () => {
    let s = atTurn(4, ["f"], ["wall"]);
    s = play(s, 0, 0);
    expect(s.players.p1.field[0]?.canAttack).toBe(false);
    const r = buzz(s, 0);
    s = r.state;
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "buzz", player: "p1", slot: 0, attack: 2, hp: 2, left: 1 }),
    );
    const before = viewUnit(
      play(atTurn(4, ["f"]), 0, 0),
      "p1",
      play(atTurn(4, ["f"]), 0, 0).players.p1.field[0] as Unit,
      catalog,
    );
    const v = viewUnit(s, "p1", s.players.p1.field[0] as Unit, catalog);
    expect(v.attack).toBe(before.attack + 2);
    expect(v.hp).toBe(before.hp + 2);
    expect(attackTargets(s, "p1", 0, catalog).every((t) => t.kind === "unit")).toBe(true);
    expect(attackTargets(s, "p1", 0, catalog).length).toBeGreaterThan(0);
  });

  it("1ターンに1回、1試合に2回まで", () => {
    let s = atTurn(4, ["f", "f"]);
    s = play(play(s, 0, 0), 0, 1);
    s = buzz(s, 0).state;
    expect(() => buzz(s, 1)).toThrow(/1ターンに1回/);
    s = end(end(s), "p2");
    s = buzz(s, 1).state;
    expect(buzzLeft(s, "p1")).toBe(0);
    s = end(end(s), "p2");
    expect(() => buzz(s, 0)).toThrow(/使い切り/);
  });

  it("便乗：自分か相手がバズを使うたび、場の便乗を持つキャラクターすべてに攻撃力+1・体力+1", () => {
    // 自分の場：便乗・便乗なし。相手の場：便乗
    let s = atTurn(4, ["bin", "f"], ["bin"]);
    s = play(play(s, 0, 0), 0, 1);
    const r = buzz(s, 1);
    s = r.state;
    const [mine, other] = [s.players.p1.field[0] as Unit, s.players.p1.field[1] as Unit];
    const foe = s.players.p2.field[0] as Unit;
    expect([mine.atkBuff, mine.hpBuff]).toEqual([1, 1]);
    expect([other.atkBuff, other.hpBuff]).toEqual([2, 2]);
    expect([foe.atkBuff, foe.hpBuff]).toEqual([1, 1]);
    expect(r.events).toContainEqual({
      type: "buffed",
      player: "p2",
      slot: 0,
      cardId: "bin",
      attack: 1,
      hp: 1,
    });
  });

  it("便乗：バズしたキャラクター自身には乗らない（+2/+2 だけ）。ほかの便乗には乗る", () => {
    let s = atTurn(4, ["bin", "bin"]);
    s = play(play(s, 0, 0), 0, 1);
    const r = buzz(s, 0);
    s = r.state;
    const [buzzed, other] = [s.players.p1.field[0] as Unit, s.players.p1.field[1] as Unit];
    expect([buzzed.atkBuff, buzzed.hpBuff]).toEqual([2, 2]);
    expect([other.atkBuff, other.hpBuff]).toEqual([1, 1]);
    expect(r.events).not.toContainEqual(expect.objectContaining({ type: "buffed", player: "p1", slot: 0 }));
  });

  it("バズの強化は晒しで消える（強化として扱う）", () => {
    let s = atTurn(4, ["f"]);
    s = play(s, 0, 0);
    s = buzz(s, 0).state;
    const u = s.players.p1.field[0] as Unit;
    expect(u.atkBuff).toBe(2);
    expect(u.hpBuff).toBe(2);
  });

  it("自分の場にキャラクターがいなければ使えない。回数は設定で変えられる", () => {
    const s = atTurn(4, []);
    expect(buzzBlock(s, "p1")).toMatch(/いません/);
    const g = createGame({ decks: { p1: F(12), p2: F(12) }, config: { buzzCount: 3 } });
    expect(buzzLeft(g, "p1")).toBe(3);
  });
});

describe("闇堕ちの姿の効果（確定除去・手札に戻す・プレイヤーを守る）", () => {
  it("攻撃力がいちばん高い相手のキャラクターを、体力に関係なく破壊する", () => {
    const s = cast(withFoe(["kill"], ["wall", "big", "f"]), 0);
    expect(s.players.p2.field.map((u) => u?.cardId ?? null)).toEqual(["wall", null, "f", null, null]);
    expect(s.players.p2.trash).toContain("big");
  });
  it("コストがいちばん高い相手のキャラクターを手札に戻す（トークンも手札に入る）", () => {
    let s = withFoe(["back", "back"], ["wall", "big"]);
    const hand = s.players.p2.hand.length;
    s = cast(s, 0);
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p2.hand).toHaveLength(hand + 1);
    expect(s.players.p2.hand.at(-1)).toBe("big");
    s.players.p2.field = s.players.p2.field.map(() => null);
    s.players.p2.field[0] = {
      ...(s.players.p2.field[0] ?? play(game(["f"]), 0, 0).players.p1.field[0]),
      cardId: "kusa",
      token: true,
    } as Unit;
    const r = run(s, { type: "cast", player: "p1", handIndex: 0 });
    expect(r.state.players.p2.field[0]).toBeNull();
    expect(r.state.players.p2.hand).toHaveLength(hand + 2);
    expect(r.state.players.p2.hand.at(-1)).toBe("kusa");
  });
  it("闇堕ちの姿が手札に戻されたら、そのカードの闇堕ちは使い終わり（次に破壊されても闇堕ちしない）", () => {
    // p2 の闇堕ちは p2 のターンの始めに出る
    let s = game(["back", "big"]);
    s.players.p2.trash = ["ren"];
    s.players.p2.darkOmens = [{ cardId: "ren", slot: 0, turn: 0 }];
    s = fall(end(s), 0, "p2");
    expect(s.players.p2.field[0]?.dark).toBe(true);
    s = end(s, "p2");
    s.players.p1.mana = 10;
    s = cast(s, 0);
    expect(s.players.p2.hand).toContain("ren");
    expect(s.players.p2.darkSpent).toEqual(["ren"]);
  });
  it("プレイヤーを守ると、次の相手のターンが終わるまでダメージを受けない", () => {
    let s = cast(game(["barrier"]), 0);
    expect(isShielded(s, "p1")).toBe(true);
    s = end(s);
    s.players.p2.mana = 30;
    s.players.p2.hand = ["twin", ...s.players.p2.hand];
    s = play(s, 0, 0, "p2");
    const r = run(s, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } });
    expect(r.state.players.p1.lp).toBe(20);
    expect(r.events.map((e) => e.type)).toContain("shield");
    s = end(r.state, "p2");
    expect(isShielded(s, "p1")).toBe(false);
  });
});

describe("相手のプレイヤーに付与する時間差のダメージ（ミコト）", () => {
  it("場に出たとき相手のプレイヤーに付き、そのターンには働かない。相手の次のターンの終わりにダメージを受ける", () => {
    const r = run(game(["oracle"]), { type: "play", player: "p1", handIndex: 0, slot: 0 });
    expect(r.events.map((e) => e.type)).toContain("delayedDamageSet");
    expect(delayedDamageOn(r.state, "p2")).toBe(7);
    expect(delayedDamageOn(r.state, "p1")).toBe(0);
    let s = end(r.state);
    expect(s.players.p2.lp).toBe(20);
    const e = run(s, { type: "endTurn", player: "p2" });
    expect(e.events.map((x) => x.type)).toEqual(
      expect.arrayContaining(["delayedDamageFired", "leaderDamaged"]),
    );
    s = e.state;
    expect(s.players.p2.lp).toBe(13);
    expect(delayedDamageOn(s, "p2")).toBe(0);
    // 1回きり：働いたら消える
    s = end(end(s), "p2");
    expect(s.players.p2.lp).toBe(13);
  });
  it("付与したキャラクターが墓地になっても、付いた効果は残る", () => {
    let s = end(play(game(["oracle"]), 0, 0));
    s.players.p1.field[0] = null;
    s = end(s, "p2");
    expect(s.players.p2.lp).toBe(13);
  });
  it("プレイヤーがダメージを受けない状態なら防がれ、効果は消える", () => {
    let s = end(play(game(["oracle"]), 0, 0));
    s.players.p2.mana = 30;
    s.players.p2.hand = ["barrier", ...s.players.p2.hand];
    s = run(s, { type: "cast", player: "p2", handIndex: 0 }).state;
    s = end(s, "p2");
    expect(s.players.p2.lp).toBe(20);
    expect(delayedDamageOn(s, "p2")).toBe(0);
  });
  it("付与した側の追加のターンでは働かず、付けられた側のターンの終わりまで待つ", () => {
    let s = game(["oracle", "again"]);
    s = play(s, 0, 0);
    s = cast(s, 0);
    s = end(s);
    expect(s.active).toBe("p1");
    s = end(s);
    expect(s.players.p2.lp).toBe(20);
    s = end(s, "p2");
    expect(s.players.p2.lp).toBe(13);
  });
  it("ライフが尽きたら付与した側の勝ち。次のターンは始まらない", () => {
    const s = end(play(game(["oracle"]), 0, 0));
    s.players.p2.lp = 7;
    const r = run(s, { type: "endTurn", player: "p2" });
    expect(r.state.winner).toBe("p1");
    expect(r.events.map((e) => e.type)).not.toContain("turnStarted");
  });
});

describe("界隈を読む効果（自分の側だけ）", () => {
  it("出たときに、自分の場のほかの配信者1体につき攻撃力+1。2界隈のカードは両方に数え、ほかの界隈は数えない。出たあとに増えても伸びない", () => {
    let s = game(["collab"]);
    s.players.p1.hand = ["s1", "s2", "idl", "f", "collab", "s1"];
    s = play(play(play(play(s, 0, 0), 0, 1), 0, 2), 0, 3); // 配信者・配信者＋アイドル・アイドルだけ・無所属
    s.players.p1.mana = 10;
    s = play(s, 0, 4);
    const atk = () => viewUnit(s, "p1", s.players.p1.field[4] as Unit, catalog).attack;
    expect(atk()).toBe(4);
    s.players.p1.field[0] = null;
    expect(atk()).toBe(4);
  });

  it("センターに出したときは呼ぶ数が増える（トップアイドル：親衛隊 1 体、センターなら 2 体）", () => {
    const local = {
      ...catalog,
      top: icon("top", 1, 3, 5, {
        effects: [{ on: "play", do: "summon", card: "f", count: 1, centerCount: 2, flank: true }],
      }),
    };
    const mk = () => {
      const s = createGame({
        decks: { p1: ["top", ...F(10)], p2: F(12) },
        seed: 42,
        shuffle: false,
        config: { startHand: 4 },
      });
      s.players.p1.mana = 10;
      return s;
    };
    const side = applyAction(mk(), { type: "play", player: "p1", handIndex: 0, slot: 0 }, local).state;
    expect(side.players.p1.field.filter((u) => u).length).toBe(2);
    const center = applyAction(mk(), { type: "play", player: "p1", handIndex: 0, slot: 2 }, local).state;
    expect(center.players.p1.field.map((u) => u?.cardId ?? null)).toEqual([null, "f", "top", "f", null]);
    // 右端に出したら左隣に。両隣が埋まっていれば、左から空いた枠へ
    const right = applyAction(mk(), { type: "play", player: "p1", handIndex: 0, slot: 4 }, local).state;
    expect(right.players.p1.field.map((u) => u?.cardId ?? null)).toEqual([null, null, null, "f", "top"]);
    const busy = mk();
    const filler = side.players.p1.field.find((u) => u?.cardId === "f") as Unit;
    busy.players.p1.field[1] = { ...filler, uid: 777 };
    busy.players.p1.field[3] = { ...filler, uid: 778 };
    const blocked = applyAction(busy, { type: "play", player: "p1", handIndex: 0, slot: 2 }, local).state;
    expect(blocked.players.p1.field.map((u) => u?.cardId ?? null)).toEqual(["f", "f", "top", "f", "f"]);
  });

  it("突進を付ける（ミーム女王）：出たばかりのキャラクターは相手のキャラクターにだけ攻撃できる", () => {
    const local = {
      ...catalog,
      queen: icon("queen", 1, 2, 4, { effects: [{ on: "play", do: "rally", attack: 0, totsu: true }] }),
    };
    let s = createGame({
      decks: { p1: ["f", "queen", ...F(10)], p2: F(12) },
      seed: 42,
      shuffle: false,
      config: { startHand: 4 },
    });
    s.players.p1.mana = 10;
    s.players.p2.field[0] = {
      ...(createGame({ decks: { p1: F(5), p2: F(5) } }).players.p1.field[0] ?? null),
      uid: 900,
      cardId: "wall",
      damage: 0,
      canAttack: false,
      attacksLeft: 0,
      atkBuff: 0,
      hpBuff: 0,
      dark: false,
      darkUsed: false,
      exposed: false,
      boundUntil: 0,
      silenced: false,
      noGuard: false,
      token: false,
    } as Unit;
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }, local).state;
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 1 }, local).state;
    for (const from of [0, 1])
      expect(attackTargets(s, "p1", from, local)).toEqual([{ kind: "unit", slot: 0 }]);
  });

  it("このターンだけの強化：ターンの終わりに消える", () => {
    const local = {
      ...catalog,
      rallyer: icon("rallyer", 2, 1, 1, {
        effects: [{ do: "buffAllies", attack: 1, hp: 0, thisTurn: true }],
      }),
    };
    let s = createGame({
      decks: { p1: ["f", "rallyer", ...F(10)], p2: F(12) },
      seed: 42,
      shuffle: false,
      config: { startHand: 4 },
    });
    s.players.p1.mana = 10;
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }, local).state;
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 1 }, local).state;
    expect(viewUnit(s, "p1", s.players.p1.field[0] as Unit, local).attack).toBe(2);
    s = applyAction(s, { type: "endTurn", player: "p1" }, local).state;
    expect(viewUnit(s, "p1", s.players.p1.field[0] as Unit, local).attack).toBe(1);
  });

  it("自分のほかのアイドルすべてに強化（アイドル以外には付かない）", () => {
    let s = play(play(play(game(["idl", "s2", "f", "producer"]), 0, 0), 0, 1), 0, 2);
    s = play(s, 0, 3);
    const v = (slot: number) => viewUnit(s, "p1", s.players.p1.field[slot] as Unit, catalog);
    expect([v(0).attack, v(0).maxHp]).toEqual([3, 2]);
    expect([v(1).attack, v(1).maxHp]).toEqual([3, 2]);
    expect([v(2).attack, v(2).maxHp]).toEqual([1, 1]);
    expect([v(3).attack, v(3).maxHp]).toEqual([2, 5]);
  });

  it("条件「自分の場にアイドルがいれば」：いれば2枚、いなければ1枚引く", () => {
    let s = game(["critic", "critic", "idl"]);
    const hand = s.players.p1.hand.length;
    s = play(s, 0, 0);
    expect(s.players.p1.hand).toHaveLength(hand - 1 + 1);
    s = play(s, 1, 1); // アイドルを出してから
    const before = s.players.p1.hand.length;
    s = play(s, 0, 2);
    expect(s.players.p1.hand).toHaveLength(before - 1 + 2);
  });

  it("山札から有識者を探して手札に加える。なければ普通に1枚引く", () => {
    let s = game(["quoteRt", "quoteRt"]);
    s.players.p1.deck = ["f", "f", "critic", "f"];
    s = cast(s, 0);
    expect(s.players.p1.hand.at(-1)).toBe("critic");
    expect(s.players.p1.deck).toEqual(["f", "f", "f"]);
    s = cast(s, 0);
    expect(s.players.p1.hand.at(-1)).toBe("f");
    expect(s.players.p1.deck).toEqual(["f", "f"]);
  });

  it("自分のアイドルだけを対象にできる呪文", () => {
    let s = play(play(game(["s1", "s2", "letter"]), 0, 0), 0, 1);
    expect(castTargets(s, "p1", "letter", catalog)).toEqual([{ side: "ally", slot: 1 }]);
    expect(() => cast(s, 0, { side: "ally", slot: 0 })).toThrow(/使えません/);
    s = cast(s, 0, { side: "ally", slot: 1 });
    expect(viewUnit(s, "p1", s.players.p1.field[1] as Unit, catalog).attack).toBe(3);
  });

  it("自分の場の配信者1体につきコストが下がる", () => {
    let s = play(play(game(["s1", "idl", "cheapStreamer"]), 0, 0), 0, 1);
    expect(effectiveCost(s, "p1", "cheapStreamer", catalog)).toBe(4);
    s = play(s, 0, 2);
    expect(s.players.p1.mana).toBe(10 - 1 - 1 - 4);
  });
});

describe("対象を選ぶ除去の呪文（確定除去・手札に戻す・奪う）", () => {
  it("完全論破：選んだ相手のキャラクターを体力に関係なく破壊する", () => {
    const s = cast(withFoe(["ronpa"], ["wall", "big"]), 0, { side: "enemy", slot: 1 });
    expect(s.players.p2.field.map((u) => u?.cardId ?? null)).toEqual(["wall", null, null, null, null]);
    expect(s.players.p2.trash).toContain("big");
  });
  it("追い炎上：ダメージを受けている相手にしか使えない", () => {
    let s = withFoe(["oibi"], ["wall", "big"]);
    expect(castTargets(s, "p1", "oibi", catalog)).toEqual([]);
    expect(() => cast(s, 0, { side: "enemy", slot: 1 })).toThrow(/使えません/);
    (s.players.p2.field[1] as Unit).damage = 1;
    expect(castTargets(s, "p1", "oibi", catalog)).toEqual([{ side: "enemy", slot: 1 }]);
    s = cast(s, 0, { side: "enemy", slot: 1 });
    expect(s.players.p2.field[1]).toBeNull();
  });
  it("ブロック：選んだ相手のキャラクターを手札に戻す（トークンも手札に入る）", () => {
    let s = withFoe(["block", "block"], ["big", "cat"]);
    const hand = s.players.p2.hand.length;
    s = cast(s, 0, { side: "enemy", slot: 0 });
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.hand).toHaveLength(hand + 1);
    const tokenSlot = s.players.p2.field.findIndex((u) => u?.token);
    s = cast(s, 0, { side: "enemy", slot: tokenSlot });
    expect(s.players.p2.field[tokenSlot]).toBeNull();
    expect(s.players.p2.hand).toHaveLength(hand + 2);
  });
  it("引き抜き：攻撃力3以下の相手だけを選んで奪える。奪ったターンは攻撃できない", () => {
    let s = withFoe(["hikinuki"], ["big", "wall"]);
    expect(castTargets(s, "p1", "hikinuki", catalog)).toEqual([{ side: "enemy", slot: 1 }]);
    s = cast(s, 0, { side: "enemy", slot: 1 });
    expect(s.players.p2.field[1]).toBeNull();
    const mine = s.players.p1.field.find((u) => u?.cardId === "wall");
    expect(mine?.canAttack).toBe(false);
  });
});

describe("推し属性の作り直し（10月24日。docs/design-oshi.md）", () => {
  const local: Record<string, RuleCard> = {
    ...catalog,
    sg: icon("sg", 3, 1, 3, { keywords: ["ガード"] }),
    gk: icon("gk", 0, 2, 1, { keywords: ["突進"], token: true }),
    // エース：闇堕ちしたとき、隣に sg を2体出し（隣が埋まっていれば空いた枠へ）、攻撃力+2・体力+2
    oshi: icon("oshi", 1, 4, 5, {
      rarity: 5,
      keywords: ["注目"],
      dark: {
        name: "闇の推し",
        attack: 5,
        hp: 4,
        keywords: ["突進", "注目"],
        effects: [
          { on: "play", do: "summon", card: "sg", count: 2, flank: true, buff: { attack: 2, hp: 2 } },
        ],
        effect: "",
      },
    }),
    // 育つ推し：センターにいれば、ターンの終わりに1枚引く
    grow: icon("grow", 1, 0, 5, {
      keywords: ["注目"],
      effects: [{ on: "turnEnd", do: "draw", count: 1, if: { center: true } }],
    }),
    // メン地下：隣に gk を出す。破壊するたび、自分の gk すべてに攻撃力+1・体力+1（親衛隊は育たない）
    men: icon("men", 1, 2, 3, {
      effects: [
        { on: "play", do: "summon", card: "gk", count: 1, flank: true },
        { on: "passive", do: "buffOnKill", cards: ["gk"], attack: 1, hp: 1 },
      ],
    }),
  };
  const go = (s: GameState, a: Action) => applyAction(s, a, local).state;
  const put = (s: GameState, handIndex: number, slot: number, player: "p1" | "p2" = "p1") =>
    go(s, { type: "play", player, handIndex, slot });
  const fin = (s: GameState, player: "p1" | "p2" = "p1") => go(s, { type: "endTurn", player });
  const ids = (s: GameState) => s.players.p1.field.map((u) => u?.cardId ?? null);

  /** p1 の slot のキャラクターを、相手の big 2 体で破壊して、次の p1 のターンに闇堕ちさせる */
  function killAndReturn(s: GameState, slot: number): GameState {
    s = fin(s);
    s.players.p2.mana = 30;
    s.players.p2.hand = ["big", "big", ...s.players.p2.hand];
    s.players.p2.field = s.players.p2.field.map(() => null);
    s = put(put(s, 0, 0, "p2"), 0, 1, "p2");
    s.players.p2.field.forEach((u) => {
      if (u) Object.assign(u, { canAttack: true, attacksLeft: 1 });
    });
    for (const from of [0, 1])
      if (s.players.p1.field[slot])
        s = go(s, { type: "attack", player: "p2", from, target: { kind: "unit", slot } });
    return go(fin(s, "p2"), { type: "darkFall", player: "p1", slot });
  }

  it("エースの闇堕ち：センターで戻れば、左右に親衛隊を1体ずつ出し、攻撃力+2・体力+2", () => {
    const s = killAndReturn(put(game(["oshi"]), 0, 2), 2);
    expect(ids(s)).toEqual([null, "sg", "oshi", "sg", null]);
    expect(s.players.p1.field[2]?.dark).toBe(true);
    for (const slot of [1, 3]) {
      expect(viewUnit(s, "p1", s.players.p1.field[slot] as Unit, local)).toMatchObject({ attack: 3, hp: 5 });
    }
    expect(viewUnit(s, "p1", s.players.p1.field[2] as Unit, local)).toMatchObject({ hp: 4 });
  });

  it("エースの闇堕ち：端の枠や隣が埋まっていても、空いている枠に2体出す（10月26日。場所で数は変わらない）", () => {
    // 端の枠：隣の1体と、左から空いた枠に1体
    expect(ids(killAndReturn(put(game(["oshi"]), 0, 0), 0))).toEqual(["oshi", "sg", "sg", null, null]);
    // センターで左が埋まっている：右の隣と、左から空いた枠
    let s = put(put(game(["f", "oshi"]), 0, 1), 0, 2);
    s = killAndReturn(s, 2);
    expect(ids(s)).toEqual(["sg", "f", "oshi", "sg", null]);
    for (const slot of [0, 3]) {
      expect(viewUnit(s, "p1", s.players.p1.field[slot] as Unit, local)).toMatchObject({ attack: 3, hp: 5 });
    }
  });

  it("エースの闇堕ち：空いている枠が1つなら1体、場が埋まっていれば出ない", () => {
    const board = (slots: number[]) => {
      let g = game([]);
      g.players.p1.hand = [...slots.map(() => "f"), "oshi"];
      slots.forEach((slot) => {
        g = put(g, 0, slot);
      });
      return killAndReturn(put(g, 0, 2), 2);
    };
    expect(ids(board([0, 1, 3]))).toEqual(["f", "f", "oshi", "f", "sg"]);
    expect(ids(board([0, 1, 3, 4]))).toEqual(["f", "f", "oshi", "f", "f"]);
  });

  it("育つ推し：センターにいれば、自分のターンの終わりに1枚引く。センターでなければ引かない", () => {
    const center = put(game(["grow"]), 0, 2);
    const n = center.players.p1.hand.length;
    expect(fin(center).players.p1.hand.length).toBe(n + 1);
    const side = put(game(["grow"]), 0, 1);
    expect(fin(side).players.p1.hand.length).toBe(n);
  });

  it("メン地下：隣にトークンを出す。トークンは突進で、出たターンに相手のキャラクターを攻撃できる", () => {
    let s = withFoe([], ["f"]);
    s.players.p1.hand = ["men", ...s.players.p1.hand];
    s = put(s, 0, 2);
    expect(ids(s)).toEqual([null, "gk", "men", null, null]);
    const gk = s.players.p1.field[1] as Unit;
    expect(gk.token).toBe(true);
    expect(gk.rushOnly).toBe(true);
    expect(attackTargets(s, "p1", 1, local).some((t) => t.kind === "leader")).toBe(false);
  });

  it("メン地下：相手のキャラクターを破壊するたび、自分のトークンすべてに攻撃力+1・体力+1。親衛隊は育たない。破壊できなければ何もしない", () => {
    let s = withFoe([], ["f", "wall"]);
    s.players.p1.hand = ["sg", "men", ...s.players.p1.hand];
    s = put(put(s, 0, 4), 0, 2);
    const men = s.players.p1.field[2] as Unit;
    Object.assign(men, { canAttack: true, attacksLeft: 2 });
    // 破壊できない相手（wall 1/6）には働かない
    let t = go(s, { type: "attack", player: "p1", from: 2, target: { kind: "unit", slot: 1 } });
    expect(viewUnit(t, "p1", t.players.p1.field[4] as Unit, local)).toMatchObject({ attack: 1, hp: 3 });
    // f（1/1）を破壊したら、gk が育つ。sg とメン地下自身は育たない
    const r = applyAction(
      t,
      { type: "attack", player: "p1", from: 2, target: { kind: "unit", slot: 0 } },
      local,
    );
    t = r.state;
    expect(viewUnit(t, "p1", t.players.p1.field[4] as Unit, local)).toMatchObject({ attack: 1, hp: 3 });
    expect(viewUnit(t, "p1", t.players.p1.field[1] as Unit, local)).toMatchObject({ attack: 3, hp: 2 });
    expect(viewUnit(t, "p1", t.players.p1.field[2] as Unit, local)).toMatchObject({ attack: 2 });
    expect(r.events.filter((e) => e.type === "buffed")).toHaveLength(1);
  });
});

describe("炎属性の作り直し（10月24日。docs/design-fire.md）", () => {
  const local: Record<string, RuleCard> = {
    ...catalog,
    sg: icon("sg", 1, 1, 3, { keywords: ["ガード"] }),
    // エース：速攻。闇の姿は攻撃力と体力が入れ替わり、速攻。闇堕ちしたとき相手全員を晒し状態にする
    ren: icon("ren", 1, 2, 4, {
      rarity: 5,
      keywords: ["速攻"],
      dark: {
        name: "闇のエース",
        attack: 4,
        hp: 2,
        keywords: ["速攻"],
        effects: [{ on: "play", do: "expose", to: "allEnemies" }],
        effect: "",
      },
    }),
    // 突進。このキャラクターが相手のキャラクターを破壊するたび、相手のプレイヤーに1ダメージ
    hib: icon("hib", 1, 3, 4, {
      keywords: ["突進"],
      effects: [{ on: "passive", do: "faceOnKill", amount: 1 }],
    }),
    // 配信者：隣にリスナーを2体出す
    st: icon("st", 1, 4, 4, {
      kaiwai: ["配信者"],
      effects: [{ on: "play", do: "summon", card: "lis", count: 2, flank: true }],
    }),
    st2: icon("st2", 1, 1, 1, { kaiwai: ["配信者"] }),
    // リスナー：1/1。出たとき、場に配信者界隈がいればガードを得る
    lis: icon("lis", 0, 1, 1, {
      token: true,
      effects: [{ on: "play", do: "guardIfKaiwai", kaiwai: "配信者" }],
    }),
    live: post("live", 1, { effects: [{ do: "summon", card: "lis", count: 2 }] }),
  };
  const go = (s: GameState, a: Action) => applyAction(s, a, local);
  const put = (s: GameState, handIndex: number, slot: number, player: "p1" | "p2" = "p1") =>
    go(s, { type: "play", player, handIndex, slot }).state;
  const fin = (s: GameState, player: "p1" | "p2" = "p1") => go(s, { type: "endTurn", player }).state;
  const ids = (s: GameState) => s.players.p1.field.map((u) => u?.cardId ?? null);

  it("ヒバナ：突進で相手のキャラクターを破壊するたび、相手のプレイヤーに1ダメージ。破壊できなければ何もしない", () => {
    let s = withFoe([], ["f", "wall"]);
    s.players.p1.hand = ["hib", ...s.players.p1.hand];
    s = put(s, 0, 2);
    (s.players.p1.field[2] as Unit).attacksLeft = 2;
    const life = s.players.p2.lp;
    s = go(s, { type: "attack", player: "p1", from: 2, target: { kind: "unit", slot: 1 } }).state;
    expect(s.players.p2.lp).toBe(life);
    s = go(s, { type: "attack", player: "p1", from: 2, target: { kind: "unit", slot: 0 } }).state;
    expect(s.players.p2.lp).toBe(life - 1);
  });

  it("リスナー：配信者の隣に出ると、ガードを得る。配信者がいなくなってもガードは残り、破壊もされない", () => {
    let s = put(game(["st"]), 0, 2);
    expect(ids(s)).toEqual([null, "lis", "st", "lis", null]);
    expect(viewUnit(s, "p1", s.players.p1.field[1] as Unit, local).keywords).toContain("ガード");
    (s.players.p1.field[2] as Unit).damage = 99;
    s = fin(s);
    expect(ids(s)).toEqual([null, "lis", null, "lis", null]);
    expect(viewUnit(s, "p1", s.players.p1.field[1] as Unit, local).keywords).toContain("ガード");
  });

  it("リスナー：場に配信者がいなければ、ただの 1/1。相手の場の配信者でもガードを得る", () => {
    let s = game(["live", "live"]);
    s = go(s, { type: "cast", player: "p1", handIndex: 0 }).state;
    const plain = s.players.p1.field.find((u) => u?.cardId === "lis") as Unit;
    expect(viewUnit(s, "p1", plain, local).keywords).not.toContain("ガード");
    s.players.p2.field[2] = { ...plain, uid: 999, cardId: "st2", token: false };
    s = go(s, { type: "cast", player: "p1", handIndex: 0 }).state;
    const guarded = s.players.p1.field.filter((u) => u?.cardId === "lis").at(-1) as Unit;
    expect(viewUnit(s, "p1", guarded, local).keywords).toContain("ガード");
  });

  it("エース：闇堕ちさせると、闇の姿が速攻で戻る。相手全員を晒し状態にして、相手のプレイヤーを殴れる", () => {
    let s = put(game(["ren"]), 0, 2);
    (s.players.p1.field[2] as Unit).damage = 99;
    s = fin(s);
    s.players.p2.mana = 30;
    s.players.p2.hand = ["sg", ...s.players.p2.hand];
    s = put(s, 0, 2, "p2");
    s = go(fin(s, "p2"), { type: "darkFall", player: "p1", slot: 2 }).state;
    const ace = s.players.p1.field[2] as Unit;
    expect(ace.dark).toBe(true);
    expect(viewUnit(s, "p1", ace, local)).toMatchObject({ attack: 4, hp: 2 });
    expect(s.players.p2.field[2]?.exposed).toBe(true);
    expect(attackTargets(s, "p1", 2, local).some((t) => t.kind === "leader")).toBe(true);
    const life = s.players.p2.lp;
    s = go(s, { type: "attack", player: "p1", from: 2, target: { kind: "leader" } }).state;
    expect(s.players.p2.lp).toBe(life - 4);
  });
});

describe("神属性の作り直し（10月24日。docs/design-god.md）", () => {
  const local: Record<string, RuleCard> = {
    ...catalog,
    sg: icon("sg", 1, 1, 3, { keywords: ["ガード"], attributes: ["神"] }),
    nsg: icon("nsg", 1, 1, 3, { keywords: ["ガード"], attributes: [] }),
    // ネ申：出したガードの数だけコスト-1。出たとき、呪文のトークン3枚を手札に加える
    god: icon("god", 13, 5, 10, {
      attributes: ["神"],
      effects: [
        { on: "hand", do: "cheaperPerGuard" },
        { on: "play", do: "addToHand", cards: ["tate", "rai", "ten"] },
      ],
    }),
    tate: post("tate", 0, { token: true, effects: [{ do: "damageCut", amount: 5 }] }),
    rai: post("rai", 0, { token: true, effects: [{ do: "damage", to: "allEnemies", amount: 5 }] }),
    ten: post("ten", 0, { token: true, effects: [{ do: "damage", to: "enemyMaster", amount: 5 }] }),
    // ミコト：山札からガードを持つ神属性のキャラクターを1枚探す
    seek: icon("seek", 1, 2, 6, {
      keywords: ["ガード"],
      effects: [{ on: "play", do: "tutor", guard: true, attribute: "神", count: 1 }],
    }),
  };
  const go = (s: GameState, a: Action) => applyAction(s, a, local);
  const put = (s: GameState, handIndex: number, slot: number, player: "p1" | "p2" = "p1") =>
    go(s, { type: "play", player, handIndex, slot }).state;
  const fin = (s: GameState, player: "p1" | "p2" = "p1") => go(s, { type: "endTurn", player }).state;

  it("ネ申：このゲームで自分が出したガードの数だけコスト-1（場から離れても戻らない）", () => {
    let s = game(["sg", "sg", "god"], F(12), 30);
    expect(effectiveCost(s, "p1", "god", local)).toBe(13);
    s = put(put(s, 0, 0), 0, 1);
    expect(effectiveCost(s, "p1", "god", local)).toBe(11);
    s.players.p1.field[0] = null;
    expect(effectiveCost(s, "p1", "god", local)).toBe(11);
  });

  it("ネ申：出たとき、盾・裁きの雷・天罰を手札に加える。呪文のトークンも使ったら墓地に行く", () => {
    let s = game(["god"], F(12), 30);
    s = put(s, 0, 2);
    expect(s.players.p1.hand.slice(-3)).toEqual(["tate", "rai", "ten"]);
    const lp = s.players.p2.lp;
    s = go(s, { type: "cast", player: "p1", handIndex: s.players.p1.hand.indexOf("ten") }).state;
    expect(s.players.p2.lp).toBe(lp - 5);
    expect(s.players.p1.trash).toContain("ten");
  });

  it("裁きの雷：相手のキャラクターすべてに5ダメージ", () => {
    let s = withFoe(["rai"], ["f", "big"]);
    s = go(s, { type: "cast", player: "p1", handIndex: 0 }).state;
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.damage).toBe(5);
  });

  it("盾：次の相手のターンの終わりまで、受けるダメージを1回ごとに5減らす。大きい一撃は差だけ通る", () => {
    let s = withFoe(["tate"], ["f", "big"]);
    s = go(s, { type: "cast", player: "p1", handIndex: 0 }).state;
    expect(damageCutOn(s, "p1")).toBe(5);
    s = fin(s);
    for (const u of s.players.p2.field) if (u) Object.assign(u, { canAttack: true, attacksLeft: 1 });
    const lp = s.players.p1.lp;
    s = go(s, { type: "attack", player: "p2", from: 0, target: { kind: "leader" } }).state;
    expect(s.players.p1.lp).toBe(lp);
    s = go(s, { type: "attack", player: "p2", from: 1, target: { kind: "leader" } }).state;
    expect(s.players.p1.lp).toBe(lp - 1);
    expect(damageCutOn(s, "p1")).toBe(5);
    // 相手のターンが終わったら消える
    s = fin(s, "p2");
    expect(s.turn > (s.players.p1.cutUntil ?? 0)).toBe(true);
    expect(damageCutOn(s, "p1")).toBe(0);
  });

  it("雑学博士：手札でいちばんコストが高い神属性のカード1枚のコスト-1。出すと消える", () => {
    const loc = {
      ...local,
      quiz: icon("quiz", 1, 1, 2, {
        effects: [{ on: "play", do: "discountHand", attribute: "神", amount: 1 }],
      }),
    };
    let s = game(["quiz", "sg", "god", "big"], F(12), 30);
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }, loc).state;
    expect(effectiveCost(s, "p1", "god", loc)).toBe(12);
    expect(effectiveCost(s, "p1", "sg", loc)).toBe(1);
    expect(effectiveCost(s, "p1", "big", loc)).toBe(4);
    s = applyAction(
      s,
      { type: "play", player: "p1", handIndex: s.players.p1.hand.indexOf("god"), slot: 2 },
      loc,
    ).state;
    expect(s.players.p1.handDiscount?.god).toBeUndefined();
  });

  it("ベテラン解説者：攻撃されたとき、受けるダメージを2減らす（攻撃力6の相手から4）", () => {
    const loc = {
      ...local,
      vet: icon("vet", 1, 2, 5, {
        keywords: ["ガード"],
        effects: [{ on: "passive", do: "armor", amount: 2 }],
      }),
    };
    let s = withFoe([], ["big"]);
    s.players.p1.hand = ["vet", ...s.players.p1.hand];
    s = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }, loc).state;
    s = applyAction(s, { type: "endTurn", player: "p1" }, loc).state;
    s = applyAction(
      s,
      { type: "attack", player: "p2", from: 0, target: { kind: "unit", slot: 0 } },
      loc,
    ).state;
    expect((s.players.p1.field[0] as Unit).damage).toBe(4);
    expect(s.players.p1.field[0]).not.toBeNull();
  });

  it("ミコト：山札からガードを持つ神属性のキャラクターを探す。ニュートラルのガードは選ばない", () => {
    let s = game(["seek"]);
    s.players.p1.deck = ["f", "nsg", "sg", ...s.players.p1.deck];
    s = put(s, 0, 0);
    expect(s.players.p1.hand).toContain("sg");
    expect(s.players.p1.deck.slice(0, 2)).toEqual(["f", "nsg"]);
  });
});

describe("水属性の作り直し（10月24日。docs/design-water.md）", () => {
  const local: Record<string, RuleCard> = {
    ...catalog,
    lis: icon("lis", 0, 1, 1, {
      token: true,
      effects: [{ on: "play", do: "guardIfKaiwai", kaiwai: "配信者" }],
    }),
    // ミナモ：隣にリスナーを2体。ターンの終わりに、リスナー1体につきライフを1回復
    vt: icon("vt", 1, 2, 5, {
      kaiwai: ["配信者"],
      effects: [
        { on: "play", do: "summon", card: "lis", count: 2, flank: true },
        { on: "turnEnd", do: "healPerCard", card: "lis" },
      ],
    }),
    // 不眠のルリ（闇の姿だけを使う）：回復するたび、コストがいちばん高い相手1体を手札に戻す
    nurse: icon("nurse", 1, 6, 2, { effects: [{ on: "passive", do: "healBounce" }] }),
    pill: post("pill", 0, { effects: [{ do: "heal", to: "master", amount: 1 }] }),
  };
  const go = (s: GameState, a: Action) => applyAction(s, a, local);

  it("ミナモ：ターンの終わりに、自分の場のリスナー1体につき自分のライフを1回復する（回復の効果として数える）", () => {
    let s = game(["vt"]);
    s.players.p1.lp = 10;
    s = go(s, { type: "play", player: "p1", handIndex: 0, slot: 2 }).state;
    s = go(s, { type: "endTurn", player: "p1" }).state;
    expect(s.players.p1.lp).toBe(12);
    expect(s.players.p1.heals).toBe(1);
  });

  it("不眠のルリ：回復するたび、コストがいちばん高い相手のキャラクター1体を持ち主の手札に戻す", () => {
    let s = withFoe(["nurse", "pill"], ["f", "big"]);
    s = go(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    const hand = s.players.p2.hand.length;
    s = go(s, { type: "cast", player: "p1", handIndex: 0 }).state;
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p2.hand.at(-1)).toBe("big");
    expect(s.players.p2.hand).toHaveLength(hand + 1);
  });
});

describe("自然属性の作り直し（10月25日。docs/design-nature.md）", () => {
  const local = { ...catalog, ...Object.fromEntries(CARDS.map((c) => [c.id, c])) } as Record<
    string,
    RuleCard
  >;
  const go = (s: GameState, a: Action) => applyAction(s, a, local);
  const put = (s: GameState, handIndex: number, slot: number) =>
    go(s, { type: "play", player: "p1", handIndex, slot }).state;
  const fin = (s: GameState, player: "p1" | "p2" = "p1") => go(s, { type: "endTurn", player }).state;
  const stat = (s: GameState, slot: number) => {
    const u = s.players.p1.field[slot] as Unit;
    const v = viewUnit(s, "p1", u, local);
    return [v.attack, v.hp];
  };

  it("伝説のコラ画像：このゲームで先に出した伝説のコラ画像1体につき攻撃力+2・体力+2（場から離れても数える）", () => {
    let s = game(["k5", "k5"], F(12), 20);
    s = put(s, 0, 0);
    expect(stat(s, 0)).toEqual([2, 3]);
    s.players.p1.field[0] = null;
    s = put(s, 0, 1);
    expect(stat(s, 1)).toEqual([4, 5]);
  });

  it("呪いのコラ画像：闇堕ちしたとき、伝説のコラ画像（トークン）を手札に加える。それも先に出した数で育つ", () => {
    let s = game(["k5"], F(12), 20);
    s = put(s, 0, 0);
    (s.players.p1.field[0] as Unit).damage = 99;
    s = go(fin(fin(s), "p2"), { type: "darkFall", player: "p1", slot: 0 }).state;
    const dark = s.players.p1.field[0] as Unit;
    expect(dark.dark).toBe(true);
    expect(stat(s, 0)).toEqual([3, 1]);
    expect(dark.canAttack && !dark.rushOnly).toBe(true);
    expect(s.players.p1.hand).toContain("t-kora");

    s.players.p1.mana = 10;
    s = put(s, s.players.p1.hand.indexOf("t-kora"), 1);
    expect(stat(s, 1)).toEqual([4, 5]);
  });

  it("伝説のコラ画像の写しも闇堕ちし、そのたびに写しを手札に加える（回数の上限なし。10月31日）", () => {
    let s = game(["t-kora"], F(12), 20);
    for (let round = 0; round < 3; round++) {
      s.players.p1.mana = 10;
      s = put(s, s.players.p1.hand.indexOf("t-kora"), 1);
      (s.players.p1.field[1] as Unit).damage = 99;
      s = fin(s);
      // 写しも、破壊された枠で裏向きになり、ほかのカードと同じく墓地へ行く
      expect(darkOmens(s, "p1").map((o) => [o.cardId, o.slot])).toEqual([["t-kora", 1]]);
      expect(s.players.p1.trash).toContain("t-kora");
      s = go(fin(s, "p2"), { type: "darkFall", player: "p1", slot: 1 }).state;
      const dark = s.players.p1.field[1] as Unit;
      expect([dark.cardId, dark.dark]).toEqual(["t-kora", true]);
      expect(s.players.p1.hand).toContain("t-kora");
      // 闇の姿が破壊されたら消える（墓地にも行かない）。次の写しを出せるように空ける
      dark.damage = 99;
      s = fin(s);
      expect(s.players.p1.field[1]).toBeNull();
      expect(darkOmens(s, "p1")).toEqual([]);
      s = fin(s, "p2");
    }
  });

  it("ワラ：空いている枠すべてに草を出し、自分のキャラクターすべてに突進を付ける", () => {
    let s = game(["c8"], F(12), 20);
    s = put(s, 0, 2);
    expect(s.players.p1.field.map((u) => u?.cardId)).toEqual(["t-kusa", "t-kusa", "c8", "t-kusa", "t-kusa"]);
    for (const u of s.players.p1.field) expect(u?.canAttack && u.rushOnly).toBe(true);
  });

  it("草の女王：草を2体出し、自分のターンの終わりに自分の草すべてに攻撃力+1・体力+1（草のほかは上がらない）", () => {
    let s = game(["f", "k19"], F(12), 20);
    s = put(s, 0, 0);
    s = put(s, 0, 2);
    expect(s.players.p1.field.filter((u) => u?.cardId === "t-kusa")).toHaveLength(2);
    s = fin(s);
    for (const [slot, u] of s.players.p1.field.entries()) {
      if (u?.cardId === "t-kusa") expect(stat(s, slot)).toEqual([2, 2]);
    }
    expect(stat(s, 0)).toEqual([1, 1]);
    expect(stat(s, 2)).toEqual([3, 5]);
  });

  it("トレンドメーカー：自分のほかのキャラクターすべてに攻撃力+2", () => {
    let s = game(["f", "k14"], F(12), 20);
    s = put(s, 0, 0);
    s = put(s, 0, 1);
    expect(stat(s, 0)).toEqual([3, 1]);
    expect(stat(s, 1)).toEqual([4, 4]);
  });
});
