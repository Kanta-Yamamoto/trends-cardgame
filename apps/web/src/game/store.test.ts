import { beforeEach, describe, expect, it } from "vitest";
import { useGame } from "./store";

describe("対戦ストア", () => {
  beforeEach(() => useGame.getState().reset());

  it("手札を選んで枠を押すと場に出る", () => {
    const s = useGame.getState();
    s.select({ kind: "hand", index: 1 }); // レン
    s.play(0);
    const g = useGame.getState().game;
    expect(g.players.p1.field[0]?.cardId).toBe("c2");
    expect(g.players.p1.mana).toBe(6);
  });

  it("反則の操作はエラー文を出して状態を変えない", () => {
    const s = useGame.getState();
    s.select({ kind: "hand", index: 0 });
    s.play(0); // シロガネ（8）
    s.select({ kind: "hand", index: 0 });
    s.play(1); // レン（6）は残り4で出せない
    expect(useGame.getState().error).toMatch(/話題力が足りません/);
    expect(useGame.getState().game.players.p1.field[1]).toBeNull();
  });

  it("ターン終了すると相手が動いて、こちらの番に戻る", () => {
    useGame.getState().endTurn();
    const g = useGame.getState().game;
    expect(g.active).toBe("p1");
    expect(g.players.p2.field.some((u) => u?.cardId === "f1")).toBe(true);
  });
});
