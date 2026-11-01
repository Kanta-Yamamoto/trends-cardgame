import {
  type Action,
  applyAction,
  createTutorialGame,
  type GameState,
  TUTORIAL,
  tutorialFoeTurn,
} from "@trends/game-core";
import { describe, expect, it } from "vitest";
import { CATALOG, ME, useGame } from "../game/store";
import { BATTLE_STEPS, type Ctx } from "./battleSteps";

const ctx = (game: GameState, o: Partial<Ctx> = {}): Ctx => ({
  game,
  hand: null,
  attacker: null,
  omenOpen: false,
  ...o,
});
const step = (id: string) => {
  const s = BATTLE_STEPS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const apply = (g: GameState, a: Action) => applyAction(g, a, CATALOG).state;

describe("チュートリアルの対戦の案内", () => {
  it("説明だけの場面は「つぎへ」で、操作の場面は押す場所を光らせる", () => {
    const g = createTutorialGame();
    for (const s of BATTLE_STEPS) {
      if (s.next) expect(s.done, s.id).toBeUndefined();
      else expect(s.done, s.id).toBeDefined();
    }
    expect(step("trade").view(ctx(g)).targets).toEqual(['[data-drop="ally:1"]']);
  });

  it("案内の順に操作すると、どの場面も次へ進み、最後に勝つ", () => {
    let g = createTutorialGame();
    const { me, character, spell, omenSlot, rivalSlot, guardSlot } = TUTORIAL;
    // レンで古参を攻撃する：選ぶ前はレン、選んだら古参を光らせる
    expect(step("trade").view(ctx(g)).targets).toEqual([`[data-drop="ally:${omenSlot}"]`]);
    expect(step("trade").view(ctx(g, { attacker: omenSlot })).targets).toEqual([
      `[data-drop="foe:${rivalSlot}"]`,
    ]);
    g = apply(g, { type: "attack", player: me, from: omenSlot, target: { kind: "unit", slot: rivalSlot } });
    expect(step("trade").done?.(ctx(g))).toBe(true);
    // ターン終了：相手がガードを出して、自分のターンに戻ったら次へ
    expect(step("endTurn").view(ctx(g)).targets).toEqual([".end-turn"]);
    g = apply(g, { type: "endTurn", player: me });
    expect(step("endTurn").done?.(ctx(g))).toBe(false);
    for (const a of tutorialFoeTurn(g)) g = apply(g, a);
    expect(step("endTurn").done?.(ctx(g))).toBe(true);
    // キャラクターを出す：選ぶ前は手札、選んだら空いている枠を光らせる
    expect(step("play").done?.(ctx(g))).toBe(false);
    expect(step("play").view(ctx(g)).targets).toEqual([`.hand [data-card="${character}"]`]);
    expect(step("play").view(ctx(g, { hand: character })).targets?.[0]).toMatch(/slot/);
    g = apply(g, { type: "play", player: me, handIndex: g.players[me].hand.indexOf(character), slot: 0 });
    expect(step("play").done?.(ctx(g))).toBe(true);
    // 呪文：選んだら相手のガードを光らせる
    expect(step("spell").done?.(ctx(g))).toBe(false);
    expect(step("spell").view(ctx(g, { hand: spell })).targets).toEqual([`[data-drop="foe:${guardSlot}"]`]);
    g = apply(g, { type: "cast", player: me, handIndex: 0, target: { side: "enemy", slot: guardSlot } });
    expect(step("spell").done?.(ctx(g))).toBe(true);
    // 闇堕ちの前に、あと何ダメージ足りないかを言う（相手のライフ 5 − 出したキャラクターの攻撃力 1）
    expect(step("short").view(ctx(g)).text).toContain("4 ダメージ");
    // 闇堕ち：小窓が開いたら「闇堕ちさせる」を光らせる
    expect(step("darkFall").done?.(ctx(g))).toBe(false);
    expect(step("darkFall").view(ctx(g, { omenOpen: true })).targets).toEqual([".dkc-go"]);
    g = apply(g, { type: "darkFall", player: me, slot: omenSlot });
    expect(step("darkFall").done?.(ctx(g))).toBe(true);
    // 攻撃：選んだら相手のプレイヤーを光らせる
    expect(step("attack1").view(ctx(g, { attacker: omenSlot })).targets).toEqual(['[data-master="p2"]']);
    g = apply(g, { type: "attack", player: me, from: omenSlot, target: { kind: "leader" } });
    expect(step("attack1").done?.(ctx(g))).toBe(true);
    expect(step("attack2").done?.(ctx(g))).toBe(false);
    expect(step("attack2").view(ctx(g)).text).toContain(`残り ${g.players.p2.lp}`);
    g = apply(g, { type: "attack", player: me, from: 0, target: { kind: "leader" } });
    expect(step("attack2").done?.(ctx(g))).toBe(true);
    expect(g.winner).toBe(ME);
  });

  it("案内の文に、カードの名前とライフの数が入る", () => {
    const g = createTutorialGame();
    const name = (id: string) => CATALOG[id]?.name ?? "";
    expect(step("trade").view(ctx(g)).text).toContain(`『${name(TUTORIAL.ace)}』`);
    expect(step("trade").view(ctx(g)).text).toContain(`『${name(TUTORIAL.rival)}』`);
    expect(step("play").view(ctx(g)).text).toContain(`『${name(TUTORIAL.character)}』`);
    expect(step("spell").view(ctx(g)).text).toContain(`『${name(TUTORIAL.spell)}』`);
    expect(step("life").view(ctx(g)).text).toContain("20");
  });
});

describe("チュートリアルの対戦（store）", () => {
  it("いつも同じ盤面で始まり、CPU 対戦の画面には出ない", () => {
    useGame.setState({ cpuDelay: 0 });
    useGame.getState().startTutorial();
    const s = useGame.getState();
    expect(s.mode).toBe("tutorial");
    expect(s.game).toEqual(createTutorialGame());
    // 操作は CPU 対戦と同じように進む（演出の登録がないテストでは、その場で反映）
    // 相手のターンは、決めた手（ガードを出してターン終了）だけを打つ
    s.endTurn();
    const g = useGame.getState().game;
    expect(g?.active).toBe(ME);
    expect(g?.turn).toBe(TUTORIAL.finalTurn);
    expect(g?.players.p2.field[TUTORIAL.guardSlot]?.cardId).toBe(TUTORIAL.guard);
    useGame.getState().quit();
    expect(useGame.getState().mode).toBe("cpu");
    expect(useGame.getState().game).toBeNull();
  });
});
