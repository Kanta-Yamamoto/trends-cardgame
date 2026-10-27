import { describe, expect, it } from "vitest";
import { checkPlayerName, PLAYER_NAME_MAX, playerNameLength } from "./player";

describe("プレイヤー名の決まり", () => {
  it("前後の空白を削って受け付ける", () => {
    expect(checkPlayerName("  そら ")).toEqual({ ok: true, name: "そら" });
  });

  it("空・長すぎる名前は断る", () => {
    expect(checkPlayerName("   ").ok).toBe(false);
    expect(checkPlayerName("あ".repeat(PLAYER_NAME_MAX)).ok).toBe(true);
    expect(checkPlayerName("あ".repeat(PLAYER_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: `${PLAYER_NAME_MAX}文字までです`,
    });
  });

  it("絵文字も 1 文字と数える", () => {
    expect(playerNameLength("🍣🍣")).toBe(2);
    expect(checkPlayerName("🍣".repeat(PLAYER_NAME_MAX)).ok).toBe(true);
  });

  it("CPU・運営とまぎらわしい名前は断る（大文字・小文字・全角を区別しない）", () => {
    for (const n of ["CPU", "cpu太郎", "ＣＰＵ", "運営です", "trends公式"])
      expect(checkPlayerName(n).ok).toBe(false);
    expect(checkPlayerName("しーぴーゆー").ok).toBe(true);
  });

  it("改行・制御文字は断る", () => {
    expect(checkPlayerName("そ\nら").ok).toBe(false);
    expect(checkPlayerName("そ\u0007ら").ok).toBe(false);
  });
});
