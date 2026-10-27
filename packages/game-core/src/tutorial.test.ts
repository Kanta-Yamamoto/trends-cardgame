import { CARDS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  attackTargets,
  canUnitAttack,
  castTargets,
  darkFallSlots,
  effectiveCost,
  openSlots,
  viewUnit,
} from "./engine";
import { createTutorialGame, TUTORIAL } from "./tutorial";
import type { Action, GameState, RuleCard } from "./types";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const { me, foe } = TUTORIAL;

const run = (g: GameState, actions: Action[]) =>
  actions.reduce((s, a) => applyAction(s, a, catalog).state, g);

describe("チュートリアルの盤面", () => {
  it("使うカードはすべてある", () => {
    for (const id of [TUTORIAL.character, TUTORIAL.spell, TUTORIAL.ace, TUTORIAL.guard]) {
      expect(catalog[id], id).toBeDefined();
    }
    expect(catalog[TUTORIAL.character]?.keywords).toContain("速攻");
    expect(catalog[TUTORIAL.ace]?.dark?.keywords).toContain("速攻");
    expect(catalog[TUTORIAL.spell]?.target).toBe("enemyIcon");
  });

  it("始めは、相手のガードがいてプレイヤーを攻撃できず、裏向きのカードはもう闇堕ちさせられる", () => {
    const g = createTutorialGame();
    expect(g.active).toBe(me);
    expect(g.players[foe].lp).toBe(TUTORIAL.foeLp);
    const guard = g.players[foe].field[TUTORIAL.guardSlot];
    expect(guard && viewUnit(g, foe, guard, catalog).guard).toBe(true);
    expect(darkFallSlots(g, me)).toEqual([TUTORIAL.omenSlot]);
    // 裏向きのカードの枠には出せない
    expect(openSlots(g, me)).not.toContain(TUTORIAL.omenSlot);
    // 手札の 2 枚をちょうど使い切れる
    const cost = g.players[me].hand.reduce((n, id) => n + effectiveCost(g, me, id, catalog), 0);
    expect(cost).toBe(g.players[me].mana);
  });

  it("キャラクターを出す → 呪文でガードを破壊 → 闇堕ち → 2 体でプレイヤーを攻撃して勝つ", () => {
    let g = createTutorialGame();
    // 1. 速攻のキャラクターを出す（出したターンから攻撃できる）
    g = run(g, [{ type: "play", player: me, handIndex: 0, slot: 0 }]);
    const chara = g.players[me].field[0];
    expect(chara?.cardId).toBe(TUTORIAL.character);
    expect(chara && canUnitAttack(g, chara)).toBe(true);
    // ガードがいる間は、プレイヤーを攻撃できない
    expect(attackTargets(g, me, 0, catalog)).toEqual([{ kind: "unit", slot: TUTORIAL.guardSlot }]);

    // 2. 呪文でガードを破壊する
    expect(castTargets(g, me, TUTORIAL.spell, catalog)).toEqual([
      { side: "enemy", slot: TUTORIAL.guardSlot },
    ]);
    g = run(g, [
      { type: "cast", player: me, handIndex: 0, target: { side: "enemy", slot: TUTORIAL.guardSlot } },
    ]);
    expect(g.players[foe].field.every((u) => !u)).toBe(true);

    // 3. 闇堕ち：裏向きのカードの枠に、闇堕ちの姿（速攻）で出る
    g = run(g, [{ type: "darkFall", player: me, slot: TUTORIAL.omenSlot }]);
    const ace = g.players[me].field[TUTORIAL.omenSlot];
    expect(ace?.cardId).toBe(TUTORIAL.ace);
    expect(ace?.dark).toBe(true);
    expect(attackTargets(g, me, TUTORIAL.omenSlot, catalog)).toContainEqual({ kind: "leader" });

    // 4. 2 体でプレイヤーを攻撃する（4 + 1 = 5）
    g = run(g, [{ type: "attack", player: me, from: TUTORIAL.omenSlot, target: { kind: "leader" } }]);
    expect(g.players[foe].lp).toBe(1);
    expect(g.winner).toBeNull();
    g = run(g, [{ type: "attack", player: me, from: 0, target: { kind: "leader" } }]);
    expect(g.players[foe].lp).toBe(0);
    expect(g.winner).toBe(me);
  });

  it("元の盤面は変えない（何度でも同じ盤面から始まる）", () => {
    const a = createTutorialGame();
    run(a, [{ type: "play", player: me, handIndex: 0, slot: 0 }]);
    expect(a).toEqual(createTutorialGame());
  });
});
