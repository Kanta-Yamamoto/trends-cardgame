import { describe, expect, it } from "vitest";
import { resultTalk } from "./result";

describe("結果の画面のちびミナモの一言", () => {
  it("勝ち：長期戦がいちばん先、次に自分の残りのライフで分ける", () => {
    expect(resultTalk(true, 16, 3, 0).text).toBe("考えて戦い抜いたね！長期戦を制したよ！");
    expect(resultTalk(true, 9, 10, 0).text).toBe("激しいバトルを制したね！");
    expect(resultTalk(true, 9, 11, 0).text).toBe("おめでとう！圧倒的だったね！");
  });

  it("負け：長期戦がいちばん先、次に相手の残りのライフで分ける", () => {
    expect(resultTalk(false, 20, 0, 15).text).toBe("長期戦に勝てるカードに変更してみよう！");
    expect(resultTalk(false, 9, 0, 10).text).toBe("惜しかったね、、、次のバトルに活かそう！");
    expect(resultTalk(false, 9, 0, 11).text).toBe("相手が一枚上手だったね。デッキを見直してみよう！");
  });
});
