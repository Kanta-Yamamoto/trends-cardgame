import type { GameEvent } from "@trends/game-core";
import { describe, expect, it } from "vitest";
import { endReason } from "./result";

const turn: GameEvent = { type: "turnStarted", player: "p1", turn: 9, mana: 9 };

describe("結果画面の決着の原因", () => {
  it("自分の山札が切れて負けた", () => {
    const r = endReason(
      [turn, { type: "deckOut", player: "p1" }, { type: "won", player: "p2" }],
      "p1",
      false,
    );
    expect(r.title).toBe("山札切れ");
    expect(r.detail).toContain("あなたの山札が0枚");
  });

  it("相手の山札が切れて勝った", () => {
    const r = endReason([turn, { type: "deckOut", player: "p2" }, { type: "won", player: "p1" }], "p1", true);
    expect(r.title).toBe("相手の山札切れ");
    expect(r.detail).toContain("相手の山札が0枚");
  });

  it("陰謀論者の特殊勝利は、闇堕ちの姿の名前で出す", () => {
    const events: GameEvent[] = [
      { type: "specialWin", player: "p2", cardId: "g4" },
      { type: "won", player: "p2" },
    ];
    expect(endReason(events, "p1", false).title).toBe("相手の『陰謀論者』の特殊勝利");
    expect(endReason(events, "p2", true).title).toBe("『陰謀論者』の特殊勝利");
  });

  it("降参・時間切れ", () => {
    expect(endReason([{ type: "resigned", player: "p2" }], "p1", true).title).toBe("相手の降参");
    expect(endReason([{ type: "timedOut", player: "p1" }], "p1", false).title).toBe("時間切れ");
  });

  it("決着の出来事がなければ、ライフが0になっての決着", () => {
    expect(endReason([turn, { type: "won", player: "p1" }], "p1", true).title).toBe("相手のライフが0");
    expect(endReason([turn], "p1", false).title).toBe("ライフが0");
  });
});
