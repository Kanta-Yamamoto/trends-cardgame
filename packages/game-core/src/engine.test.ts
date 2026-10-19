import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { planTurn } from "./ai";
import { deckAttributes, encodeCustomDeck, resolveDeckRef, validateDeck } from "./deck";
import {
  applyAction,
  attackTargets,
  canDarkFall,
  castTargets,
  createGame,
  darkReady,
  effectiveCost,
  isShielded,
  legalTargets,
  previewAttack,
  viewUnit,
} from "./engine";
import { type Action, type GameState, type RuleCard, RuleError, type Unit } from "./types";

type Extra = Partial<RuleCard>;
const icon = (id: string, cost: number, attack: number, hp: number, extra: Extra = {}): RuleCard => ({
  id,
  type: "icon",
  cost,
  attack,
  hp,
  keywords: [],
  effects: [],
  attributes: ["草"],
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
  totsu: icon("totsu", 2, 2, 2, { keywords: ["凸"] }),
  charger: icon("charger", 3, 2, 3, {
    keywords: ["凸"],
    effects: [{ on: "rush", do: "buffSelf", attack: 2, hp: 2 }],
  }),
  idol: icon("idol", 2, 1, 3, { keywords: ["注目"] }),
  guard: icon("guard", 2, 1, 5, { keywords: ["ガード"] }),
  cat: icon("cat", 3, 1, 2, { effects: [{ on: "play", do: "summon", card: "kusa", count: 2 }] }),
  copy: icon("copy", 2, 1, 1, { effects: [{ on: "play", do: "copySelf" }] }),
  nori: icon("nori", 2, 2, 2, { effects: [{ on: "play", do: "buffSelfPerPlayed", attack: 1 }] }),
  kora: icon("kora", 5, 2, 5, { effects: [{ on: "passive", do: "attackPerAlly" }] }),
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
  flamer: icon("flamer", 1, 1, 1, { attributes: ["炎上"] }),
  rider: icon("rider", 2, 2, 2, {
    attributes: ["炎上"],
    effects: [{ on: "play", do: "buffSelf", attack: 1, hp: 0, if: { allies: "炎上", atLeast: 2 } }],
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
  // 界隈を読む効果のテスト用（配信者 s1/s2、アイドル idl、無所属 f）
  s1: icon("s1", 1, 1, 1, { kaiwai: ["配信者"] }),
  s2: icon("s2", 1, 1, 1, { kaiwai: ["配信者", "アイドル"] }),
  idl: icon("idl", 1, 1, 1, { kaiwai: ["アイドル"] }),
  collab: icon("collab", 3, 2, 3, {
    kaiwai: ["配信者"],
    effects: [{ on: "passive", do: "attackPerAlly", kaiwai: "配信者" }],
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
  therapy: post("therapy", 2, { effects: [{ do: "heal", to: "allAlliesAndMaster", amount: 2 }] }),
};
const F = (n: number) => Array.from({ length: n }, () => "f");

/** 山札を並び替えずに作る。話題力は十分に持たせる */
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
const hit = (s: GameState, from: number, slot: number) =>
  run(s, { type: "attack", player: "p1", from, target: { kind: "unit", slot } });
const face = (s: GameState, from: number) =>
  run(s, { type: "attack", player: "p1", from, target: { kind: "leader" } });

/** 相手（p2）の場に、手札の先頭から順にアイコンを並べて p1 のターンに戻す */
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
  it("場は5枠。先攻は手札3枚・話題力1、後攻は手札4枚で最初のターンだけ話題力+1", () => {
    const s = createGame({ decks: { p1: F(25), p2: F(25) }, seed: 1 });
    expect(s.players.p1.field).toHaveLength(5);
    expect(s.players.p1.hand).toHaveLength(3);
    expect(s.players.p2.hand).toHaveLength(4);
    const t2 = end(s);
    expect(t2.players.p2.mana).toBe(2);
    expect(end(end(t2, "p2")).players.p2.mana).toBe(2);
  });
  it("手札は9枚まで。いっぱいのときに引いたカードはオワコンへ", () => {
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

describe("場に出す・投稿を使う", () => {
  it("アイコンは話題力を払って空いた枠に出る。投稿は場に出せない", () => {
    const s = play(game(["big"]), 0, 4);
    expect(s.players.p1.field[4]?.cardId).toBe("big");
    expect(s.players.p1.mana).toBe(6);
    expect(() => play(game(["fansa"]), 0, 0)).toThrow(/投稿/);
    expect(() => play(game(["big"], undefined, 3), 0, 0)).toThrow(RuleError);
  });
  it("対象が必要な投稿は、正しい対象がないと使えない。使った投稿はオワコンへ", () => {
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
  it("凸：場に出たターンに相手のアイコンにだけ攻撃できる（マスターは不可）。次のターンからは普通", () => {
    let s = withFoe(["totsu"], ["wall"]);
    s = play(s, 0, 0);
    expect(attackTargets(s, "p1", 0, catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    expect(() => face(s, 0)).toThrow(/攻撃/);
    s = hit(s, 0, 0).state;
    expect(s.players.p2.field[0]?.damage).toBe(2);
    s = end(end(s), "p2");
    expect(attackTargets(s, "p1", 0, catalog)).toContainEqual({ kind: "leader" });
  });
  it("凸で攻撃したとき：上がった攻撃力で殴り、強化は残る。次のターン以降や、マスターへの攻撃では働かない", () => {
    let s = withFoe(["charger"], ["wall"]);
    s = play(s, 0, 0);
    const r = hit(s, 0, 0);
    expect(r.events.map((e) => e.type)).toEqual(["buffed", "battle"]);
    expect(r.events[1]).toMatchObject({ type: "battle", toDefender: 4, toAttacker: 1 });
    s = r.state;
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog)).toMatchObject({ attack: 4, hp: 4 });
    // 次のターンは普通の攻撃（凸の効果は出たターンだけ）
    s = end(end(s), "p2");
    const r2 = hit(s, 0, 0);
    expect(r2.events.map((e) => e.type)).not.toContain("buffed");
  });
  it("攻撃の見込み：与える・受けるダメージと、倒せるか・倒されるか", () => {
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
  it("ガード：いる間は、ガードしか攻撃できない（ほかのアイコンもマスターも不可）", () => {
    let s = withFoe(["rush"], ["guard", "wall"]);
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    expect(() => face(s, 0)).toThrow(/ガード/);
    expect(() => hit(s, 0, 1)).toThrow(/ガード/);
  });
  it("晒し者はガードがいても攻撃でき、次の自分のターンが終わると元に戻る", () => {
    let s = withFoe(["expose", "rush"], ["guard", "wall"]);
    s = cast(s, 0, { side: "enemy", slot: 1 });
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "unit", slot: 1 });
    s = end(end(s), "p2");
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "unit", slot: 1 });
    s = end(end(s), "p2");
    expect(legalTargets(s, "p1", catalog)).not.toContainEqual({ kind: "unit", slot: 1 });
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
  it("草を生やす・空き枠を埋める。トークンはオワコンに残らない", () => {
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
    expect(s.players.p1.trash).not.toContain("kusa");
  });
  it("コピー：同じアイコンがもう1体出て、オワコンには残らない", () => {
    const s = play(game(["copy"]), 0, 0);
    expect(s.players.p1.field.filter((u) => u?.cardId === "copy")).toHaveLength(2);
    expect(s.players.p1.field[1]?.token).toBe(true);
  });
  it("ノリ：このターンに出したほかのカード1枚につき攻撃力+1", () => {
    const s = play(play(play(game(["f", "f", "nori"]), 0, 0), 0, 1), 0, 2);
    expect(viewUnit(s, "p1", s.players.p1.field[2] as never, catalog).attack).toBe(4);
  });
  it("コラ画像：自分の場のほかのアイコン1体につき攻撃力+1", () => {
    const s = play(play(play(game(["f", "f", "kora"]), 0, 0), 0, 1), 0, 2);
    expect(viewUnit(s, "p1", s.players.p1.field[2] as never, catalog).attack).toBe(4);
  });
  it("神：相手のガードをすべて消す／専門家：いちばん強い相手に3ダメージ", () => {
    let s = withFoe(["kami", "expert"], ["guard", "big"]);
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toContainEqual({ kind: "leader" });
    s.players.p1.mana = 10;
    s = play(s, 0, 1);
    expect(s.players.p2.field[1]?.damage).toBe(3);
  });
  it("癒し：アイコンとライフを回復する（ライフは20まで）", () => {
    let s = play(game(["wall", "healer"]), 0, 0);
    const wall = s.players.p1.field[0];
    if (wall) wall.damage = 5;
    s.players.p1.lp = 19;
    s = play(s, 0, 1);
    expect(s.players.p1.field[0]?.damage).toBe(3);
    expect(s.players.p1.lp).toBe(20);
  });
  it("ファンサ：自分のアイコン1体に攻撃力+2・体力+2", () => {
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
  it("闇堕ちを持つカードも、倒されたらいったんオワコンへ行く（勝手には戻らない）", () => {
    let s = withFoe(["big"], ["ren"]);
    s = play(s, 0, 0);
    s = end(end(s), "p2");
    const r = hit(s, 0, 0);
    expect(r.events.map((e) => e.type)).not.toContain("darkFall");
    expect(r.state.players.p2.field[0]).toBeNull();
    expect(r.state.players.p2.trash).toContain("ren");
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
      decks: { p1: DECKS.flame, p2: DECKS.idol },
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
            for (const x of planTurn(s, s.active, real)) s = applyAction(s, x, real).state;
          }
          expect(s.winner).not.toBeNull();
        }
    // 15 デッキ × 15 × 2 = 450 試合。CI の遅いマシンでは 5 秒を超える
  }, 60_000);
});

describe("デッキの決まり", () => {
  const real = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
  it("デモ用デッキはすべて決まりを守っている（属性2つまで＋共通）", () => {
    for (const [id, deck] of Object.entries(DECKS)) {
      expect({ id, errors: validateDeck(deck, real) }).toEqual({ id, errors: [] });
      expect(deckAttributes(deck, real).length).toBeLessThanOrEqual(2);
    }
  });
  it("属性が3つ以上・枚数違い・4枚目・トークンは反則", () => {
    const three = [...Array(9).fill("f6").slice(0, 3), ...Array(3).fill("m6"), ...Array(3).fill("i7")];
    const errors = validateDeck([...three, "t-kusa", "f6"], real);
    expect(errors.some((e) => e.includes("30枚"))).toBe(true);
    expect(errors.some((e) => e.includes("属性は2つまで"))).toBe(true);
    expect(errors.some((e) => e.includes("トークン"))).toBe(true);
    expect(errors.some((e) => e.includes("3枚まで"))).toBe(true);
  });
  it("デッキの指し方：構築済みの ID か custom:（カード ID をカンマでつなぐ）", () => {
    expect(resolveDeckRef("flame", DECKS)).toEqual(DECKS.flame);
    const ref = encodeCustomDeck(DECKS.idol);
    expect(ref.startsWith("custom:")).toBe(true);
    expect(resolveDeckRef(ref, DECKS)).toEqual(DECKS.idol);
    expect(resolveDeckRef("nope", DECKS)).toBeNull();
    expect(resolveDeckRef("custom:", DECKS)).toBeNull();
    expect(resolveDeckRef("custom:f1,../x", DECKS)).toBeNull();
    expect(resolveDeckRef(42, DECKS)).toBeNull();
  });
  it("共通カードは属性に数えない", () => {
    expect(deckAttributes(["n1", "n2", "f6"], real)).toEqual(["炎上"]);
  });
  it("10通りの属性の組み合わせと、5つの単属性に、デッキが1つずつある", () => {
    const pairs = Object.values(DECKS).map((d) => [...deckAttributes(d, real)].sort().join("×"));
    expect(new Set(pairs).size).toBe(15);
    expect(pairs.filter((p) => !p.includes("×"))).toHaveLength(5);
  });
  it("デモ用デッキには、闇堕ちを持つ★5が2枚以上入っている（1枚だと出せる試合が少なすぎる）", () => {
    for (const [id, deck] of Object.entries(DECKS)) {
      const aces = deck.filter((c) => real[c]?.rarity === 5 && real[c]?.dark);
      expect({ id, ok: aces.length >= 2 }).toEqual({ id, ok: true });
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
  it("ほかのアイコンすべてを強化する（自分は含まない）", () => {
    const s = play(play(game(["f", "host"]), 0, 0), 0, 1);
    expect(viewUnit(s, "p1", s.players.p1.field[0] as never, catalog).attack).toBe(2);
    expect(viewUnit(s, "p1", s.players.p1.field[1] as never, catalog).attack).toBe(3);
  });
  it("相手のアイコンすべてと相手のマスターにダメージ", () => {
    let s = withFoe(["queen"], ["f", "wall"]);
    s = play(s, 0, 0);
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.damage).toBe(2);
    expect(s.players.p2.lp).toBe(18);
  });
  it("投稿で相手のマスターにダメージ", () => {
    const s = cast(game(["burn"]), 0);
    expect(s.players.p2.lp).toBe(17);
  });
  it("相手のアイコンすべて／いちばん強い1体を眠らせる", () => {
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
  it("相手のアイコンを倒すたび、もう1回攻撃できる", () => {
    let s = play(withFoe(["chain"], ["f", "f"]), 0, 0);
    s = hit(s, 0, 0).state;
    s = hit(s, 0, 1).state;
    expect(s.players.p2.field.every((u) => !u)).toBe(true);
    // 2体目を倒した分の攻撃も残っている。マスターへの攻撃では増えない
    s = face(s, 0).state;
    expect(s.players.p2.lp).toBe(18);
    expect(() => face(s, 0)).toThrow(RuleError);
  });
  it("センターのトップアイドル：自分のほかのアイコンもターンの始めに伸びる", () => {
    let s = play(play(game(["aura", "f"]), 0, 2), 0, 0);
    s = end(end(s), "p2");
    expect(s.players.p1.field[2]?.atkBuff).toBe(2);
    expect(s.players.p1.field[0]?.atkBuff).toBe(1);
  });
  it("推し変：攻撃力が条件以下の相手のアイコンを奪う。奪ったターンは攻撃できない", () => {
    const s = play(withFoe(["thief"], ["big", "f"]), 0, 0);
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p1.field[1]?.cardId).toBe("f");
    expect(() => face(s, 1)).toThrow(RuleError);
  });
  it("子守唄：相手のターンの始めに、相手の攻撃力がいちばん高いアイコンが眠る", () => {
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
  it("場のアイコンの数だけ安くなり、出たときに全員すぐ攻撃でき、ガードを無視できる", () => {
    let s = withFoe(["f", "f", "f", "swarm"], ["guard"]);
    s = play(play(play(s, 0, 0), 0, 1), 0, 2);
    expect(effectiveCost(s, "p1", "swarm", catalog)).toBe(6);
    s = play(s, 0, 3);
    expect(s.players.p1.mana).toBe(10 - 3 - 6);
    s = face(s, 0).state;
    expect(s.players.p2.lp).toBe(20 - 3);
  });
  it("使った投稿の数だけ安くなり、出したあとにもう一度自分のターン", () => {
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
  it("回復の効果を使うたび：数を数え、healGrow は強くなり、healBurn は相手のマスターにダメージ", () => {
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
  it("体力が1以下の相手のアイコンをすべて倒す", () => {
    const s = play(withFoe(["sweeper"], ["f", "wall", "f"]), 0, 0);
    expect(s.players.p2.field.map((u) => u?.cardId ?? null)).toEqual([null, "wall", null, null, null]);
  });
  it("蘇生：オワコンのコスト以下のアイコンのうち、いちばんコストが高いものが場に戻る（投稿・高いものは選ばない）", () => {
    const s = game(["nurse"]);
    s.players.p1.trash = ["big", "wall", "block", "pet"];
    const r = run(s, { type: "play", player: "p1", handIndex: 0, slot: 2 });
    expect(r.events).toContainEqual({ type: "revived", player: "p1", cardId: "wall", slot: 0 });
    expect(r.state.players.p1.field[0]?.cardId).toBe("wall");
    expect(r.state.players.p1.trash).toEqual(["big", "block", "pet"]);
    // 戻ったターンは攻撃できない
    expect(() => face(r.state, 0)).toThrow(RuleError);
  });
  it("変身：相手のアイコンが草（トークン）になる。元のカードはオワコンにも手札にも行かない", () => {
    const s = cast(withFoe(["meme"], ["big", "f"]), 0, { side: "enemy", slot: 0 });
    const u = s.players.p2.field[0];
    expect(u?.cardId).toBe("kusa");
    expect(u?.token).toBe(true);
    expect(s.players.p2.trash).not.toContain("big");
    expect(s.players.p2.hand).not.toContain("big");
    expect(s.players.p2.field[1]?.cardId).toBe("f");
  });
  it("場のアイコン2体につき1枚引く（最大3枚）。トークンも数える", () => {
    let s = play(play(game(["cat", "f", "replies", "replies"]), 0, 0), 0, 3);
    // cat ＋ 草2体 ＋ f ＝ 4体 → 2枚
    expect(s.players.p1.field.filter((u) => u).length).toBe(4);
    const before = s.players.p1.hand.length;
    s = cast(s, 0);
    expect(s.players.p1.hand.length).toBe(before - 1 + 2);
  });
  it("相手のアイコンすべての攻撃力を下げる（0より下にはならない）", () => {
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

describe("闇堕ち（オワコンから）", () => {
  const darkFall = (s: GameState, slot: number, player: "p1" | "p2" = "p1") =>
    run(s, { type: "darkFall", player, cardId: "ren", slot });
  /** p1 の ren を場に出し、p2 の big に倒させて p1 の番に戻す */
  function killRen(s: GameState, slot = 0): GameState {
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
    s = end(s, "p2");
    s.players.p1.mana = 10;
    return s;
  }

  it("★5も手札から普通に出す。場にいる間は闇堕ちできない", () => {
    const s = play(game(["ren"]), 0, 2);
    expect(s.players.p1.field[2]?.cardId).toBe("ren");
    expect(s.players.p1.mana).toBe(4);
    expect(darkReady(s, "p1", catalog)).toEqual([]);
    expect(canDarkFall(s, "p1", catalog)).toBe(false);
    expect(() => darkFall(s, 0)).toThrow(/オワコンにある/);
  });

  it("オワコンに行ったら、コストなしで闇堕ちの姿で出せて、闇堕ちしたときの効果が働く", () => {
    let s = play(game(["ren"]), 0, 0);
    s = killRen(s);
    expect(s.players.p1.trash).toContain("ren");
    expect(darkReady(s, "p1", catalog)).toEqual(["ren"]);
    expect(canDarkFall(s, "p1", catalog)).toBe(true);
    const r = darkFall(s, 3);
    s = r.state;
    expect(r.events.map((e) => e.type)).toContain("darkFall");
    expect(s.players.p1.mana).toBe(10);
    expect(s.players.p1.trash).not.toContain("ren");
    const u = s.players.p1.field[3];
    expect(viewUnit(s, "p1", u as never, catalog)).toMatchObject({ attack: 7, hp: 3, name: "闇堕ちレン" });
    // 闇堕ちしたとき：相手のアイコンすべてに1ダメージ
    expect(s.players.p2.field.filter((x) => x).every((x) => (x?.damage ?? 0) >= 1)).toBe(true);
  });

  it("闇堕ちの姿は、戻ってきたターンから相手のアイコンに攻撃できる（凸。マスターは次のターンから）", () => {
    let s = withFoe(["ren"], ["wall"]);
    s = play(s, 0, 0);
    s = darkFall(killRen(s), 0).state;
    const u = s.players.p1.field[0];
    expect(u?.canAttack).toBe(true);
    expect(u?.attacksLeft).toBe(2); // 連撃
    const targets = attackTargets(s, "p1", 0, catalog);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.kind === "unit")).toBe(true);
    expect(() => face(s, 0)).toThrow();
    const slot = (targets[0] as { slot: number }).slot;
    expect(hit(s, 0, slot).events[0]).toMatchObject({ type: "battle", toDefender: 7 });
    s = end(end(s), "p2");
    expect(attackTargets(s, "p1", 0, catalog)).toContainEqual({ kind: "leader" });
  });

  it("倒されたそのターンのうちにも、すぐ闇堕ちできる", () => {
    let s = withFoe(["ren"], ["big"]);
    s = play(s, 0, 0);
    const mine = s.players.p1.field[0] as Unit;
    s.players.p1.field[0] = { ...mine, canAttack: true, attacksLeft: 1 };
    s = hit(s, 0, 0).state;
    expect(s.players.p1.field[0]).toBeNull();
    expect(canDarkFall(s, "p1", catalog)).toBe(true);
    s = darkFall(s, 0).state;
    expect(s.players.p1.field[0]?.dark).toBe(true);
  });

  it("闇堕ちは1枚につき1回。闇堕ちの姿が倒されたら、もう出せない（TL浄化で戻っても同じ）", () => {
    let s = play(game(["ren", "cleanse"]), 0, 0);
    s = darkFall(killRen(s), 0).state;
    s = cast(s, 0);
    expect(s.players.p1.field[0]?.dark).toBe(false);
    s = killRen(s);
    expect(s.players.p1.trash).toContain("ren");
    expect(darkReady(s, "p1", catalog)).toEqual([]);
    expect(() => darkFall(s, 0)).toThrow(/1回/);
  });

  it("同じカードが2枚オワコンにあれば、それぞれ1回ずつ闇堕ちできる", () => {
    let s = game([]);
    s.players.p1.trash = ["ren", "ren"];
    s = darkFall(s, 0).state;
    expect(darkReady(s, "p1", catalog)).toEqual(["ren"]);
    s = darkFall(s, 1).state;
    expect(darkReady(s, "p1", catalog)).toEqual([]);
  });

  it("場が埋まっていたら闇堕ちできない", () => {
    const s = game([]);
    s.players.p1.trash = ["ren"];
    s.players.p1.field = s.players.p1.field.map((_, i) => ({
      ...(play(game(["f"]), 0, 0).players.p1.field[0] as Unit),
      uid: 500 + i,
    }));
    expect(canDarkFall(s, "p1", catalog)).toBe(false);
  });
});

describe("闇堕ちの姿の効果（確定除去・手札に戻す・マスターを守る）", () => {
  it("攻撃力がいちばん高い相手のアイコンを、体力に関係なく倒す", () => {
    const s = cast(withFoe(["kill"], ["wall", "big", "f"]), 0);
    expect(s.players.p2.field.map((u) => u?.cardId ?? null)).toEqual(["wall", null, "f", null, null]);
    expect(s.players.p2.trash).toContain("big");
  });
  it("コストがいちばん高い相手のアイコンを手札に戻す（トークンは消える）", () => {
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
    expect(r.state.players.p2.hand).toHaveLength(hand + 1);
  });
  it("闇堕ちの姿が手札に戻されたら、そのカードの闇堕ちは使い終わり", () => {
    let s = game(["back"]);
    s.players.p2.trash = ["ren"];
    s = end(s);
    s = run(s, { type: "darkFall", player: "p2", cardId: "ren", slot: 0 }).state;
    s = end(s, "p2");
    s.players.p1.mana = 10;
    s = cast(s, 0);
    expect(s.players.p2.hand).toContain("ren");
    expect(s.players.p2.darkSpent).toEqual(["ren"]);
  });
  it("マスターを守ると、次の相手のターンが終わるまでダメージを受けない", () => {
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

describe("界隈を読む効果（自分の側だけ）", () => {
  it("自分の場のほかの配信者1体につき攻撃力+1。2界隈のカードは両方に数える", () => {
    let s = game(["collab"]);
    s.players.p1.hand = ["collab", "s1", "s2", "idl", "f"];
    s = play(s, 0, 0);
    const atk = () => viewUnit(s, "p1", s.players.p1.field[0] as Unit, catalog).attack;
    expect(atk()).toBe(2);
    s = play(s, 0, 1); // 配信者
    expect(atk()).toBe(3);
    s = play(s, 0, 2); // 配信者＋アイドル
    expect(atk()).toBe(4);
    s = play(s, 0, 3); // アイドルだけ
    s = play(s, 0, 4); // 無所属
    expect(atk()).toBe(4);
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

  it("自分のアイドルだけを対象にできる投稿", () => {
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

describe("対象を選ぶ除去の投稿（確定除去・手札に戻す・奪う）", () => {
  it("完全論破：選んだ相手のアイコンを体力に関係なく倒す", () => {
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
  it("ブロック：選んだ相手のアイコンを手札に戻す（トークンは消える）", () => {
    let s = withFoe(["block", "block"], ["big", "cat"]);
    const hand = s.players.p2.hand.length;
    s = cast(s, 0, { side: "enemy", slot: 0 });
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.hand).toHaveLength(hand + 1);
    const tokenSlot = s.players.p2.field.findIndex((u) => u?.token);
    s = cast(s, 0, { side: "enemy", slot: tokenSlot });
    expect(s.players.p2.field[tokenSlot]).toBeNull();
    expect(s.players.p2.hand).toHaveLength(hand + 1);
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
