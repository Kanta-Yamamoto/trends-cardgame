import { describe, expect, it } from "vitest";
import { planTurn } from "./ai";
import { applyAction, createGame, effectiveCost, legalTargets } from "./engine";
import { type Action, type GameState, type RuleCard, RuleError } from "./types";

const catalog: Record<string, RuleCard> = {
  c1: { id: "c1", cost: 8, power: 8000, tribe: "光輪" },
  c2: { id: "c2", cost: 6, power: 7200, tribe: "紅蓮", keywords: ["速攻"] },
  c3: { id: "c3", cost: 5, power: 6500, tribe: "蒼空" },
  halo: { id: "halo", cost: 2, power: 2000, tribe: "光輪" },
  sky: { id: "sky", cost: 1, power: 1000, tribe: "蒼空" },
  guard: { id: "guard", cost: 3, power: 3000, tribe: "光輪", keywords: ["ガード"] },
  spread: { id: "spread", cost: 2, power: 1500, tribe: "蒼空", keywords: ["拡散"] },
  flame: { id: "flame", cost: 4, power: 5000, tribe: "紅蓮", keywords: ["炎上"] },
  bless: { id: "bless", cost: 2, power: 2000, tribe: "光輪", keywords: ["祝福"] },
  haste: { id: "haste", cost: 1, power: 1500, tribe: "紅蓮", keywords: ["速攻"] },
  big: { id: "big", cost: 4, power: 9000, tribe: "炎上" },
  f: { id: "f", cost: 1, power: 100, tribe: "なし" },
};
const F = (n: number) => Array.from({ length: n }, () => "f");

/** 山札を並び替えずに作る。話題力は十分に持たせる */
function game(p1: string[], p2: string[] = ["f", ...F(10)], mana = 10): GameState {
  const s = createGame({ decks: { p1, p2 }, seed: 42, shuffle: false });
  s.players.p1.mana = mana;
  s.players.p1.maxMana = mana;
  return s;
}
const run = (s: GameState, a: Action) => applyAction(s, a, catalog);
const play = (s: GameState, handIndex: number, slot: number, player: "p1" | "p2" = "p1") =>
  run(s, { type: "play", player, handIndex, slot }).state;
const end = (s: GameState, player: "p1" | "p2" = "p1") => run(s, { type: "endTurn", player }).state;

describe("準備", () => {
  it("先攻は4枚・話題力1で始まり、後攻は5枚持ち、最初のターンだけ話題力+1", () => {
    const s = createGame({ decks: { p1: F(20), p2: F(20) }, seed: 1 });
    expect(s.players.p1.hand).toHaveLength(4);
    expect(s.players.p1.deck).toHaveLength(16);
    expect(s.players.p2.hand).toHaveLength(5);
    expect(s.players.p1.mana).toBe(1);
    const t2 = end(s);
    expect(t2.players.p2.mana).toBe(2);
    expect(t2.players.p2.maxMana).toBe(1);
    const t4 = end(end(t2, "p2"));
    expect(t4.players.p2.mana).toBe(2);
  });
  it("同じ seed なら同じ並び、違う seed なら違う並びになる", () => {
    const deck = ["c1", "c2", "c3", "halo", "sky", "guard", "spread", "flame", "bless", "haste"];
    const a = createGame({ decks: { p1: deck, p2: deck }, seed: 7 });
    const b = createGame({ decks: { p1: deck, p2: deck }, seed: 7 });
    const c = createGame({ decks: { p1: deck, p2: deck }, seed: 8 });
    expect(a.players.p1.hand).toEqual(b.players.p1.hand);
    expect([...a.players.p1.hand, ...a.players.p1.deck]).not.toEqual([
      ...c.players.p1.hand,
      ...c.players.p1.deck,
    ]);
  });
});

describe("話題力とターン", () => {
  it("ターンごとに上限が1増えて全回復し、10で止まる", () => {
    let s = createGame({ decks: { p1: F(40), p2: F(40) }, shuffle: false });
    const seen: number[] = [];
    for (let i = 0; i < 24; i++) {
      seen.push(s.players[s.active].maxMana);
      s = end(s, s.active);
    }
    expect(seen.filter((_, i) => i % 2 === 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
    expect(seen.filter((_, i) => i % 2 === 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  });
  it("ターン開始時に1枚引く", () => {
    const s = end(game(["c3", "c2", "c1", "halo", "sky"]));
    expect(s.players.p2.hand).toHaveLength(6);
  });
  it("山札が引けなければ、そのプレイヤーの負け", () => {
    const s = createGame({ decks: { p1: F(5), p2: F(5) }, shuffle: false });
    const r = run(s, { type: "endTurn", player: "p1" });
    expect(r.state.winner).toBe("p1");
    expect(r.events.map((e) => e.type)).toContain("deckOut");
  });
  it("相手のターンには操作できない", () => {
    expect(() => run(game(["c3", "c2", "c1", "f"]), { type: "endTurn", player: "p2" })).toThrow(
      /相手のターン/,
    );
  });
});

describe("場に出す", () => {
  it("コスト分の話題力を払って場に出る", () => {
    const { state, events } = run(game(["c3", "c2", "c1", "f"]), {
      type: "play",
      player: "p1",
      handIndex: 0,
      slot: 1,
    });
    expect(state.players.p1.mana).toBe(5);
    expect(state.players.p1.field[1]?.cardId).toBe("c3");
    expect(events[0]).toMatchObject({ type: "played", cost: 5 });
  });
  it("話題力が足りなければ出せない", () => {
    expect(() => play(game(["c1", "f", "f", "f"], undefined, 7), 0, 0)).toThrow(RuleError);
  });
  it("埋まっている枠には出せない", () => {
    const s = play(game(["c3", "c2", "c1", "f"]), 0, 0);
    expect(() => play(s, 0, 0)).toThrow(/すでに/);
  });
  it("元の state は変更しない", () => {
    const s = game(["c3", "c2", "c1", "f"]);
    play(s, 0, 0);
    expect(s.players.p1.hand).toEqual(["c3", "c2", "c1", "f"]);
  });
});

describe("キーワード", () => {
  it("速攻：出したターンに攻撃できる。持たないカードは攻撃できない", () => {
    let s = play(game(["haste", "c3", "f", "f"]), 0, 0);
    expect(s.players.p1.field[0]?.canAttack).toBe(true);
    s = play(s, 0, 1);
    expect(() => run(s, { type: "attack", player: "p1", from: 1, target: { kind: "leader" } })).toThrow(
      /攻撃できません/,
    );
  });
  it("ガード：相手にガードがいると、本体やほかのカードは攻撃できない", () => {
    let s = game(["haste", "f", "f", "f", ...F(5)], ["guard", "halo", ...F(10)]);
    s = end(s);
    s.players.p2.mana = 10;
    s = play(s, 0, 0, "p2");
    s = play(s, 0, 1, "p2");
    s = end(s, "p2");
    s = play(s, 0, 0);
    expect(legalTargets(s, "p1", catalog)).toEqual([{ kind: "unit", slot: 0 }]);
    expect(() => run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } })).toThrow(
      /ガード/,
    );
    expect(() =>
      run(s, { type: "attack", player: "p1", from: 0, target: { kind: "unit", slot: 1 } }),
    ).toThrow(/ガード/);
  });
  it("拡散：出したときに1枚引く", () => {
    const s = play(game(["spread", "f", "f", "f", "c1"]), 0, 0);
    expect(s.players.p1.hand).toEqual(["f", "f", "f", "c1"]);
  });
  it("炎上：お互いのフォロワーが2000減る", () => {
    const s = play(game(["flame", "f", "f", "f"]), 0, 0);
    expect(s.players.p1.lp).toBe(18000);
    expect(s.players.p2.lp).toBe(18000);
  });
  it("祝福：自分のフォロワーが2000増える（最大20000）", () => {
    let s = game(["bless", "bless", "f", "f"]);
    s.players.p1.lp = 15000;
    s = play(s, 0, 0);
    expect(s.players.p1.lp).toBe(17000);
    s.players.p1.lp = 19500;
    s = play(s, 0, 1);
    expect(s.players.p1.lp).toBe(20000);
  });
});

describe("カード固有の効果", () => {
  it("シロガネ：場の〈光輪〉1枚につきコスト-1", () => {
    let s = game(["halo", "halo", "c1", "f"]);
    expect(effectiveCost(s, "p1", "c1", catalog)).toBe(8);
    s = play(play(s, 0, 0), 0, 1);
    expect(effectiveCost(s, "p1", "c1", catalog)).toBe(6);
  });
  it("レン：攻撃すると相手の手札が1枚トラッシュへ", () => {
    const s = play(game(["c2", "c3", "c1", "f"]), 0, 0);
    const before = s.players.p2.hand.length;
    const r = run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } });
    expect(r.state.players.p2.hand).toHaveLength(before - 1);
    expect(r.state.players.p2.lp).toBe(20000 - 7200);
    expect(r.events.map((e) => e.type)).toEqual(["leaderDamaged", "discarded"]);
  });
  it("ミナモ：上3枚に〈蒼空〉があれば手札に加え、残りは山札の下へ", () => {
    const s = game(["c3", "f", "f", "f", "f", "sky", "f", "c1"]);
    const { state, events } = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    expect(state.players.p1.hand).toContain("sky");
    expect(state.players.p1.deck).toEqual(["c1", "f", "f"]);
    expect(events[1]).toMatchObject({ type: "searched", added: "sky" });
  });
});

describe("バトルと勝敗", () => {
  function vsUnit(foeCard: string) {
    let s = game(["c2", "c3", "c1", "f", ...F(5)], [foeCard, ...F(10)]);
    s = end(s);
    s.players.p2.mana = 10;
    s = play(s, 0, 1, "p2");
    s = end(s, "p2");
    s.players.p1.mana = 10;
    return play(s, 0, 0);
  }
  it("パワーが高いほうが勝ち、負けたカードはトラッシュへ", () => {
    const s = run(vsUnit("flame"), {
      type: "attack",
      player: "p1",
      from: 0,
      target: { kind: "unit", slot: 1 },
    }).state;
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p2.trash).toContain("flame");
    expect(s.players.p1.field[0]?.cardId).toBe("c2");
  });
  it("パワーが低い攻撃側は返り討ち", () => {
    const s = run(vsUnit("big"), {
      type: "attack",
      player: "p1",
      from: 0,
      target: { kind: "unit", slot: 1 },
    }).state;
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p2.field[1]?.cardId).toBe("big");
  });
  it("フォロワーが0になったら勝ち、以降は操作できない", () => {
    let s = game(["c2", "f", "f", "f"]);
    s.players.p2.lp = 7000;
    s = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    s = run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } }).state;
    expect(s.winner).toBe("p1");
    expect(() => end(s)).toThrow(/終了/);
  });
  it("炎上で自分が先に0になったら負け", () => {
    let s = game(["flame", "f", "f", "f"]);
    s.players.p1.lp = 1500;
    s = play(s, 0, 0);
    expect(s.winner).toBe("p2");
  });
});

describe("CPU", () => {
  it("出せるカードを出し、合法な攻撃をしてターンを終える", () => {
    let s = game(["c2", "haste", "f", "f", ...F(5)], ["guard", ...F(10)]);
    s = end(s);
    s.players.p2.mana = 10;
    s = play(s, 0, 0, "p2");
    s = end(s, "p2");
    s.players.p1.mana = 7;
    const plan = planTurn(s, "p1", catalog);
    let cur = s;
    for (const a of plan) cur = applyAction(cur, a, catalog).state;
    expect(plan.at(-1)).toEqual({ type: "endTurn", player: "p1" });
    expect(cur.players.p2.field[0]).toBeNull(); // ガードを倒している
  });
  it("CPU同士で最後まで対戦でき、必ず決着がつく", () => {
    const deck = ["c1", "c2", "c3", "halo", "sky", "guard", "spread", "flame", "bless", "haste"];
    for (const seed of [1, 2, 3, 4, 5]) {
      let s = createGame({ decks: { p1: [...deck, ...deck], p2: [...deck, ...deck] }, seed });
      for (let turn = 0; turn < 80 && !s.winner; turn++) {
        for (const a of planTurn(s, s.active, catalog)) s = applyAction(s, a, catalog).state;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});
