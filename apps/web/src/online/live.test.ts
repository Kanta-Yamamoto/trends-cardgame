import { describe, expect, it } from "vitest";
import { formatClock, leftAt } from "./live";

const view = {
  running: "p1" as const,
  turnLeft: 30_000,
  bank: { p1: 300_000, p2: 300_000 },
  pickLeft: null,
  holdMs: 0,
};

describe("画面の持ち時間", () => {
  it("手番の人は、ターンの残りと持ち時間が一緒に減る。相手は減らない", () => {
    const me = leftAt(view, 0, 12_000, "p1", "p1");
    expect(me).toEqual({ running: true, turn: 18_000, bank: 288_000, pick: null });
    expect(formatClock(me.bank)).toBe("4:48");
    expect(leftAt(view, 0, 12_000, "p2", "p1")).toEqual({
      running: false,
      turn: 0,
      bank: 300_000,
      pick: null,
    });
  });

  it("対戦の始めの待ちのあいだは減らない", () => {
    expect(leftAt({ ...view, holdMs: 5_000 }, 0, 4_000, "p1", "p1").bank).toBe(300_000);
  });
});
