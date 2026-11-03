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
    expect(r).toEqual({ line: "山札が0枚で、カードを引けなかった" });
  });

  it("相手の山札が切れて勝った", () => {
    const r = endReason([turn, { type: "deckOut", player: "p2" }, { type: "won", player: "p1" }], "p1", true);
    expect(r.line).toBe("相手の山札が0枚で、カードを引けなかった");
  });

  it("陰謀論者の特殊勝利は、闇堕ちの姿の名前で出し、決め手はそのカード", () => {
    const events: GameEvent[] = [
      { type: "specialWin", player: "p2", cardId: "g4" },
      { type: "won", player: "p2" },
    ];
    expect(endReason(events, "p1", false)).toEqual({
      line: "相手の『陰謀論者』の特殊勝利",
      finisher: { cardId: "g4", mine: false },
    });
    expect(endReason(events, "p2", true).line).toBe("『陰謀論者』の特殊勝利");
  });

  it("降参・時間切れには決め手が無い", () => {
    expect(endReason([{ type: "resigned", player: "p2" }], "p1", true)).toEqual({ line: "相手が降参した" });
    expect(endReason([{ type: "timedOut", player: "p1" }], "p1", false)).toEqual({
      line: "持ち時間が切れた",
    });
  });

  it("ライフが0になっての決着：攻撃したキャラクターが決め手", () => {
    const events: GameEvent[] = [
      turn,
      { type: "leaderDamaged", player: "p2", amount: 3, lp: 0, by: "c9" },
      { type: "won", player: "p1" },
    ];
    expect(endReason(events, "p1", true)).toEqual({
      line: "相手のライフを0にした",
      finisher: { cardId: "c9", mine: true },
    });
    expect(endReason(events, "p2", false)).toEqual({
      line: "ライフが0になった",
      finisher: { cardId: "c9", mine: false },
    });
  });

  it("呪文のダメージは、そのすぐ前に唱えた呪文が決め手", () => {
    const events: GameEvent[] = [
      turn,
      { type: "cast", player: "p2", cardId: "f2", cost: 2 },
      { type: "leaderDamaged", player: "p1", amount: 2, lp: 0 },
      { type: "won", player: "p2" },
    ];
    expect(endReason(events, "p1", false).finisher).toEqual({ cardId: "f2", mine: false });
  });

  it("記録から分からなければ決め手は出さない", () => {
    expect(endReason([turn, { type: "won", player: "p1" }], "p1", true)).toEqual({
      line: "相手のライフを0にした",
      finisher: undefined,
    });
  });
});
