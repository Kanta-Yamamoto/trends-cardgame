// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { entrySound, tapSoundOf } from "./se";

describe("場に出るときの効果音", () => {
  it("トークンはトークンの音、ほかのキャラクターは召喚の音", () => {
    expect(entrySound({ token: true }).name).toBe("token");
    expect(entrySound({}).name).toBe("summon");
  });
});

const button = (className: string, attribute?: string) => {
  const b = document.createElement("button");
  b.className = className;
  if (attribute) b.setAttribute(attribute, "");
  b.innerHTML = "<span>押す</span>";
  return b;
};

describe("ボタンを押したときの効果音", () => {
  it("主のボタンは基本の音で、中の文字を押しても鳴らす", () => {
    expect(tapSoundOf(button("btn lg"))).toBe("uiTap");
    expect(tapSoundOf(button("btn end-turn").firstElementChild)).toBe("uiTap");
  });

  it("data-tap-se を付けたものは基本の音", () => {
    expect(tapSoundOf(button("hm-icon-btn", "data-tap-se"))).toBe("uiTap");
    expect(tapSoundOf(button("hm-tile", "data-tap-se").firstElementChild)).toBe("uiTap");
    expect(tapSoundOf(button("btn ghost quit", "data-tap-se"))).toBe("uiTap");
  });

  it("大事な決める操作は、主のボタンでもすりガラスのボタンでも決める音", () => {
    expect(tapSoundOf(button("btn lg", "data-decide-se"))).toBe("uiDecide");
    expect(tapSoundOf(button("btn ghost", "data-decide-se").firstElementChild)).toBe("uiDecide");
  });

  it("すりガラス・字だけのボタンとほかの要素は鳴らさない", () => {
    expect(tapSoundOf(button("btn ghost"))).toBeNull();
    expect(tapSoundOf(button("btn text"))).toBeNull();
    expect(tapSoundOf(button("hm-news"))).toBeNull();
    expect(tapSoundOf(null)).toBeNull();
  });
});
