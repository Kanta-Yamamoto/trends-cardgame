import { type Action, applyAction, createTutorialGame, type GameState, TUTORIAL } from "@trends/game-core";
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
    expect(step("play").view(ctx(g)).targets).toEqual(['.hand [data-card="f1"]']);
  });

  it("案内の順に操作すると、どの場面も次へ進み、最後に勝つ", () => {
    let g = createTutorialGame();
    const { me, character, spell, omenSlot, guardSlot } = TUTORIAL;
    // キャラクターを出す：選ぶ前は手札、選んだら空いている枠を光らせる
    expect(step("play").done?.(ctx(g))).toBe(false);
    expect(step("play").view(ctx(g, { hand: character })).targets?.[0]).toMatch(/slot/);
    g = apply(g, { type: "play", player: me, handIndex: 0, slot: 0 });
    expect(step("play").done?.(ctx(g))).toBe(true);
    // 呪文：選んだら相手のガードを光らせる
    expect(step("spell").done?.(ctx(g))).toBe(false);
    expect(step("spell").view(ctx(g, { hand: spell })).targets).toEqual([`[data-drop="foe:${guardSlot}"]`]);
    g = apply(g, { type: "cast", player: me, handIndex: 0, target: { side: "enemy", slot: guardSlot } });
    expect(step("spell").done?.(ctx(g))).toBe(true);
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

  it("案内の文に、カードの名前が入る", () => {
    const g = createTutorialGame();
    const name = (id: string) => CATALOG[id]?.name ?? "";
    expect(step("play").view(ctx(g)).text).toContain(`『${name(TUTORIAL.character)}』`);
    expect(step("spell").view(ctx(g)).text).toContain(`『${name(TUTORIAL.spell)}』`);
    expect(step("omen").view(ctx(g)).text).toContain(`『${name(TUTORIAL.ace)}』`);
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
    s.select({ kind: "hand", index: 0 });
    useGame.getState().play(0);
    expect(useGame.getState().game?.players[ME].field[0]?.cardId).toBe(TUTORIAL.character);
    useGame.getState().quit();
    expect(useGame.getState().mode).toBe("cpu");
    expect(useGame.getState().game).toBeNull();
  });
});
