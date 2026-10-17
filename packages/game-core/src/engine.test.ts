import { CARDS, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { planTurn } from "./ai";
import { applyAction, createGame, legalTargets, viewUnit } from "./engine";
import { type Action, type GameState, type RuleCard, RuleError } from "./types";

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
  ...extra,
});

const catalog: Record<string, RuleCard> = {
  f: icon("f", 1, 1, 1),
  wall: icon("wall", 2, 1, 6),
  big: icon("big", 4, 6, 6),
  rush: icon("rush", 1, 1, 1, { keywords: ["速攻"] }),
  twin: icon("twin", 2, 2, 3, { keywords: ["速攻", "連撃"] }),
  basher: icon("basher", 2, 2, 5, { keywords: ["速攻", "叩き"] }),
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
    keywords: ["連撃"],
    dark: { name: "闇堕ちレン", attack: 7, hp: 3, keywords: ["連撃", "叩き"], effect: "" },
  }),
  kusa: icon("kusa", 0, 1, 1, { token: true }),
  expose: post("expose", 1, { target: "enemyIcon", effects: [{ do: "expose" }, { do: "draw", count: 1 }] }),
  fire: post("fire", 3, { target: "enemyIcon", effects: [{ do: "damage", amount: 3 }, { do: "expose" }] }),
  sleep: post("sleep", 2, { target: "enemyIcon", effects: [{ do: "bind" }] }),
  note: post("note", 2, { target: "enemyIcon", effects: [{ do: "silence" }, { do: "weaken", attack: 2 }] }),
  fansa: post("fansa", 2, { target: "allyIcon", effects: [{ do: "buff", attack: 2, hp: 2 }] }),
  meadow: post("meadow", 3, { effects: [{ do: "fill", card: "kusa" }] }),
  cleanse: post("cleanse", 4, { effects: [{ do: "cleanse" }] }),
};
const F = (n: number) => Array.from({ length: n }, () => "f");

/** 山札を並び替えずに作る。話題力は十分に持たせる */
function game(p1: string[], p2: string[] = F(12), mana = 10): GameState {
  const s = createGame({ decks: { p1: [...p1, ...F(10)], p2: [...p2, ...F(10)] }, seed: 42, shuffle: false });
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
  it("場は5枠。先攻は4枚・話題力1、後攻は5枚で最初のターンだけ話題力+1", () => {
    const s = createGame({ decks: { p1: F(25), p2: F(25) }, seed: 1 });
    expect(s.players.p1.field).toHaveLength(5);
    expect(s.players.p1.hand).toHaveLength(4);
    expect(s.players.p2.hand).toHaveLength(5);
    const t2 = end(s);
    expect(t2.players.p2.mana).toBe(2);
    expect(end(end(t2, "p2")).players.p2.mana).toBe(2);
  });
  it("山札が引けなければ、そのプレイヤーの負け", () => {
    const s = createGame({ decks: { p1: F(5), p2: F(5) }, shuffle: false });
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
  it("叩き：ダメージを受けている相手を攻撃すると攻撃力+2", () => {
    let s = withFoe(["basher", "twin"], ["wall"]);
    s = play(play(s, 0, 0), 0, 1);
    s = hit(s, 1, 0).state; // 連撃で 2 ダメージ
    const r = hit(s, 0, 0);
    expect(r.events[0]).toMatchObject({ type: "battle", toDefender: 4 });
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
  it("闇堕ち：一度倒されると裏返って場に残り、二度目はオワコンへ", () => {
    let s = withFoe(["big", "big"], ["ren"]);
    s = play(play(s, 0, 0), 0, 1);
    s = end(end(s), "p2");
    const r = hit(s, 0, 0);
    expect(r.events.map((e) => e.type)).toContain("darkFall");
    const u = r.state.players.p2.field[0];
    expect(u?.dark).toBe(true);
    expect(viewUnit(r.state, "p2", u as never, catalog)).toMatchObject({
      attack: 7,
      hp: 3,
      name: "闇堕ちレン",
    });
    s = hit(r.state, 1, 0).state;
    expect(s.players.p2.field[0]).toBeNull();
    expect(s.players.p2.trash).toContain("ren");
  });
  it("TL浄化：闇堕ちを表に戻し、強化と状態を消す。戻ったら、また闇堕ちできる", () => {
    let s = withFoe(["big", "cleanse"], ["ren"]);
    s = play(s, 0, 0);
    s = end(end(s), "p2");
    s = hit(s, 0, 0).state;
    s.players.p1.mana = 10;
    s = cast(s, 0);
    const u = s.players.p2.field[0];
    expect(u?.dark).toBe(false);
    expect(u?.darkUsed).toBe(false);
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
    const s = createGame({ decks: { p1: DECKS.flame, p2: DECKS.idol }, seed: 3 });
    const plan = planTurn(s, "p1", real);
    let cur = s;
    for (const a of plan) cur = applyAction(cur, a, real).state;
    expect(plan.at(-1)).toEqual({ type: "endTurn", player: "p1" });
  });
  it("3つのデッキどうしで最後まで対戦でき、必ず決着がつく", () => {
    const ids = Object.keys(DECKS) as (keyof typeof DECKS)[];
    for (const a of ids)
      for (const b of ids)
        for (const seed of [1, 2]) {
          let s = createGame({ decks: { p1: DECKS[a], p2: DECKS[b] }, seed });
          for (let t = 0; t < 100 && !s.winner; t++) {
            for (const x of planTurn(s, s.active, real)) s = applyAction(s, x, real).state;
          }
          expect(s.winner).not.toBeNull();
        }
  });
});
