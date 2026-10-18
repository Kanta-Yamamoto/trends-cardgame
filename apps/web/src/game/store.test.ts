import { beforeEach, describe, expect, it } from "vitest";
import { builtinDeck } from "./decks";
import { CATALOG, CPU, ME, useGame } from "./store";

describe("対戦ストア", () => {
  beforeEach(() => {
    useGame.setState({ cpuDelay: 0 });
    useGame.getState().start(builtinDeck("idol"), { seed: 7, first: ME });
  });

  it("デッキを選ぶと先攻・後攻が決まり、手札が配られる", () => {
    const g = useGame.getState().game;
    expect(g?.active).toBe(ME);
    expect(g?.players[ME].hand).toHaveLength(4);
    expect(g?.players[CPU].hand).toHaveLength(5);
  });

  it("反則の操作はエラー文を出して状態を変えない", () => {
    const s = useGame.getState();
    const hand = s.game?.players[ME].hand ?? [];
    // 話題力1では出せないアイコン（デッキの中身が変わっても同じことを確かめる）
    const heavy = hand.findIndex((id) => CATALOG[id]?.type === "icon" && (CATALOG[id]?.cost ?? 0) > 1);
    expect(heavy).toBeGreaterThanOrEqual(0);
    s.select({ kind: "hand", index: heavy });
    s.play(0);
    expect(useGame.getState().error).toMatch(/話題力が足りません/);
    expect(useGame.getState().game?.players[ME].field[0]).toBeNull();
  });

  it("ターン終了すると CPU が動いて、こちらの番に戻る", () => {
    useGame.getState().endTurn();
    const s = useGame.getState();
    expect(s.game?.active).toBe(ME);
    expect(s.game?.turn).toBe(3);
    expect(s.cpuBusy).toBe(false);
    expect(s.log.some((l) => l.e.type === "turnStarted" && l.e.player === CPU)).toBe(true);
  });

  it("CPU が先攻ならすぐ CPU が1ターン動く", () => {
    useGame.getState().start(builtinDeck("flame"), { seed: 3, first: CPU });
    expect(useGame.getState().game?.active).toBe(ME);
    expect(useGame.getState().game?.turn).toBe(2);
  });

  it("ターン終了だけを続けても、最後は勝敗がつく", () => {
    for (let i = 0; i < 40 && !useGame.getState().game?.winner; i++) useGame.getState().endTurn();
    expect(useGame.getState().game?.winner).toBe(CPU);
  });
});
