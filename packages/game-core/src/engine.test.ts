import { describe, expect, it } from "vitest";
import { applyAction, createGame, effectiveCost } from "./engine";
import { type GameState, type RuleCard, RuleError } from "./types";

const catalog: Record<string, RuleCard> = {
  c1: { id: "c1", cost: 8, power: 8000, tribe: "光輪" },
  c2: { id: "c2", cost: 6, power: 7200, tribe: "紅蓮", keywords: ["速攻"] },
  c3: { id: "c3", cost: 5, power: 6500, tribe: "蒼空" },
  halo: { id: "halo", cost: 2, power: 2000, tribe: "光輪" },
  sky: { id: "sky", cost: 1, power: 1000, tribe: "蒼空" },
  foe: { id: "foe", cost: 4, power: 5000, tribe: "炎上" },
  big: { id: "big", cost: 4, power: 9000, tribe: "炎上" },
  filler: { id: "filler", cost: 1, power: 100, tribe: "なし" },
};

function game(p1: string[], p2: string[] = ["foe", "filler", "filler", "filler"]): GameState {
  return createGame({ decks: { p1, p2 }, seed: 42 });
}
const run = (s: GameState, a: Parameters<typeof applyAction>[1]) => applyAction(s, a, catalog);

describe("場に出す", () => {
  it("コスト分の話題力を払って場に出る", () => {
    const { state, events } = run(game(["c3", "c2", "c1"]), {
      type: "play",
      player: "p1",
      handIndex: 0,
      slot: 1,
    });
    expect(state.players.p1.mana).toBe(7);
    expect(state.players.p1.field[1]?.cardId).toBe("c3");
    expect(events[0]).toMatchObject({ type: "played", cost: 5 });
  });

  it("話題力が足りなければ出せない", () => {
    let s = game(["c1", "c2", "c3"]);
    s = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }).state; // 残り4
    expect(() => run(s, { type: "play", player: "p1", handIndex: 0, slot: 1 })).toThrow(RuleError);
  });

  it("埋まっている枠には出せない", () => {
    const s = run(game(["c3", "c2", "c1"]), { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    expect(() => run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 })).toThrow(/すでに/);
  });

  it("元の state は変更しない", () => {
    const s = game(["c3", "c2", "c1"]);
    run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    expect(s.players.p1.hand).toEqual(["c3", "c2", "c1"]);
  });
});

describe("シロガネ：〈光輪〉1枚につきコスト-1", () => {
  it("場に〈光輪〉がいなければコスト8", () => {
    expect(effectiveCost(game(["c1", "halo", "filler"]), "p1", "c1", catalog)).toBe(8);
  });
  it("場の〈光輪〉1枚でコスト7", () => {
    const s = run(game(["halo", "c1", "filler"]), {
      type: "play",
      player: "p1",
      handIndex: 0,
      slot: 0,
    }).state;
    expect(effectiveCost(s, "p1", "c1", catalog)).toBe(7);
  });
});

describe("レン：速攻と、攻撃時の手札破壊", () => {
  it("出したターンから攻撃できる", () => {
    const s = run(game(["c2", "c3", "c1"]), { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    expect(s.players.p1.field[0]?.canAttack).toBe(true);
  });
  it("速攻を持たないカードは出したターンに攻撃できない", () => {
    const s = run(game(["c3", "c2", "c1"]), { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    expect(() => run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } })).toThrow(
      /攻撃できません/,
    );
  });
  it("攻撃すると相手の手札が1枚トラッシュへ", () => {
    let s = run(game(["c2", "c3", "c1"]), { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
    const before = s.players.p2.hand.length;
    const r = run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } });
    s = r.state;
    expect(s.players.p2.hand.length).toBe(before - 1);
    expect(s.players.p2.trash.length).toBe(1);
    expect(s.players.p2.lp).toBe(20000 - 7200);
    expect(r.events.map((e) => e.type)).toEqual(["leaderDamaged", "discarded"]);
  });
  it("同じ seed なら捨てるカードも同じ", () => {
    const s = run(game(["c2", "c3", "c1"], ["foe", "big", "filler", "c3"]), {
      type: "play",
      player: "p1",
      handIndex: 0,
      slot: 0,
    }).state;
    const a = run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } }).state;
    const b = run(s, { type: "attack", player: "p1", from: 0, target: { kind: "leader" } }).state;
    expect(a.players.p2.trash).toEqual(b.players.p2.trash);
  });
});

describe("ミナモ：山札から〈蒼空〉を1枚手札に", () => {
  it("上3枚に〈蒼空〉があれば手札に加え、残りは山札の下へ", () => {
    const s = game(["c3", "filler", "filler", "filler", "sky", "filler", "c1"]);
    // 手札: c3, filler, filler / 山札: filler, sky, filler, c1
    const { state, events } = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    expect(state.players.p1.hand).toContain("sky");
    expect(state.players.p1.deck).toEqual(["c1", "filler", "filler"]);
    expect(events[1]).toMatchObject({ type: "searched", added: "sky" });
  });
  it("なければ何も加えず、3枚とも山札の下へ", () => {
    const s = game(["c3", "filler", "filler", "filler", "filler", "filler", "c1"]);
    const { state, events } = run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 });
    expect(state.players.p1.hand).toEqual(["filler", "filler"]);
    expect(state.players.p1.deck).toEqual(["c1", "filler", "filler", "filler"]);
    expect(events[1]).toMatchObject({ type: "searched", added: null });
  });
});

describe("バトル", () => {
  function withFoeUnit(foeCard: string) {
    let s = game(["c2", "c3", "c1"], [foeCard, "filler", "filler", "filler"]);
    s = run(s, { type: "endTurn", player: "p1" }).state;
    s = run(s, { type: "play", player: "p2", handIndex: 0, slot: 1 }).state;
    s = run(s, { type: "endTurn", player: "p2" }).state;
    return run(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }).state;
  }
  it("パワーが高いほうが勝ち、負けたカードはトラッシュへ", () => {
    const s = run(withFoeUnit("foe"), {
      type: "attack",
      player: "p1",
      from: 0,
      target: { kind: "unit", slot: 1 },
    }).state;
    expect(s.players.p2.field[1]).toBeNull();
    expect(s.players.p2.trash).toContain("foe");
    expect(s.players.p1.field[0]?.cardId).toBe("c2");
  });
  it("パワーが低い攻撃側は返り討ち", () => {
    const s = run(withFoeUnit("big"), {
      type: "attack",
      player: "p1",
      from: 0,
      target: { kind: "unit", slot: 1 },
    }).state;
    expect(s.players.p1.field[0]).toBeNull();
    expect(s.players.p1.trash).toContain("c2");
    expect(s.players.p2.field[1]?.cardId).toBe("big");
  });
});

describe("ターンと勝敗", () => {
  it("ターン終了で相手に手番が移り、話題力回復・1枚ドロー・場のカードが攻撃可能に", () => {
    let s = run(game(["c3", "c2", "c1", "filler"]), {
      type: "play",
      player: "p1",
      handIndex: 0,
      slot: 0,
    }).state;
    s = run(s, { type: "endTurn", player: "p1" }).state;
    expect(s.active).toBe("p2");
    s = run(s, { type: "endTurn", player: "p2" }).state;
    expect(s.active).toBe("p1");
    expect(s.players.p1.mana).toBe(12);
    expect(s.players.p1.hand).toContain("filler");
    expect(s.players.p1.field[0]?.canAttack).toBe(true);
  });
  it("相手のターンには操作できない", () => {
    expect(() => run(game(["c3", "c2", "c1"]), { type: "endTurn", player: "p2" })).toThrow(/相手のターン/);
  });
  it("フォロワーが0になったら勝ち、以降は操作できない", () => {
    let s = createGame({
      decks: { p1: ["c2", "c3", "c1"], p2: ["foe", "filler", "filler"] },
      config: { startLp: 7000 },
    });
    const r = applyAction(s, { type: "play", player: "p1", handIndex: 0, slot: 0 }, catalog);
    s = applyAction(
      r.state,
      { type: "attack", player: "p1", from: 0, target: { kind: "leader" } },
      catalog,
    ).state;
    expect(s.winner).toBe("p1");
    expect(() => run(s, { type: "endTurn", player: "p1" })).toThrow(/終了/);
  });
});
