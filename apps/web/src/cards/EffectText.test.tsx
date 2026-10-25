import { render, screen } from "@testing-library/react";
import { CARDS } from "@trends/cards";
import { describe, expect, it, vi } from "vitest";
import { EffectText } from "./EffectText";
import { HoloCard } from "./HoloCard";

describe("EffectText", () => {
  it("〈種族〉とキーワードを強調する", () => {
    const { container } = render(<EffectText text="速攻。〈蒼空〉カード1枚を手札に加える。" />);
    const kws = [...container.querySelectorAll(".kw")].map((e) => e.textContent);
    expect(kws).toEqual(["速攻", "〈蒼空〉"]);
  });
});

describe("HoloCard", () => {
  it("カードデータの名前・攻撃力・体力を表示する", () => {
    const ren = CARDS.find((c) => c.id === "c2");
    if (!ren) throw new Error("c2 not found");
    const { container } = render(<HoloCard card={ren} idle={false} />);
    expect(screen.getByRole("img", { name: /^レン（/ })).toBeInTheDocument();
    expect(container.querySelector(".stat-atk")).toHaveTextContent(String(ren.attack));
    expect(container.querySelector(".stat-hp")).toHaveTextContent(String(ren.hp));
    // カードに要らない文字（通し番号など）は出さない
    expect(container.textContent).not.toMatch(/SERIAL|No\. 007/);
  });
});

describe("イラストのないカード", () => {
  it("専用デザインがなければ共通デザインで表示する", () => {
    const guard = CARDS.find((c) => c.id === "i8");
    if (!guard) throw new Error("i8 not found");
    const { container } = render(<HoloCard card={guard} idle={false} />);
    expect(container.querySelector(".kg")).not.toBeNull();
    expect(screen.getByText("ASMR配信者")).toBeInTheDocument();
    expect(container.querySelector(".stat-atk")).toHaveTextContent(String(guard.attack));
    expect(container.querySelector(".stat-hp")).toHaveTextContent(String(guard.hp));
  });

  it("効果文が先頭のキーワードで始まっても重複キーにならない", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<EffectText text="ガード（相手はこのカードから攻撃しないといけない）" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("トークンの名前", () => {
  it("効果文のトークンの名前を押すと、そのカードの効果が開く", async () => {
    const { HelpSheet } = await import("../help/HelpSheet");
    const { fireEvent } = await import("@testing-library/react");
    const neshin = CARDS.find((c) => c.id === "g20");
    if (!neshin) throw new Error("g20 not found");
    const { container } = render(
      <>
        <EffectText text={neshin.effect} />
        <HelpSheet />
      </>,
    );
    const names = [...container.querySelectorAll(".kw-help")].map((e) => e.textContent);
    expect(names).toEqual(expect.arrayContaining(["盾", "裁きの雷", "天罰"]));
    fireEvent.click(screen.getByText("裁きの雷"));
    expect(screen.getByRole("dialog", { name: "裁きの雷 の効果" })).toHaveTextContent(
      "相手のキャラクター1体に5ダメージ。",
    );
  });

  it("リスナー・ガチ恋勢も押せる。草は用語集の解説のまま", async () => {
    const { TOKEN_CARDS, HELP } = await import("../help/help");
    expect(Object.keys(TOKEN_CARDS)).toEqual(expect.arrayContaining(["リスナー", "ガチ恋勢"]));
    expect(TOKEN_CARDS.草).toBeUndefined();
    expect(HELP.草).toBeDefined();
  });

  it("トークンの名前は、そのトークンを出す・加えるカードの効果文にだけ出てくる（ほかの語と取り違えない）", async () => {
    const { TOKEN_CARDS } = await import("../help/help");
    for (const c of CARDS) {
      const data = JSON.stringify([c.effects, c.dark?.effects ?? []]);
      for (const text of [c.effect, c.dark?.effect ?? ""]) {
        for (const [name, token] of Object.entries(TOKEN_CARDS)) {
          if (c.id === token.id || !text.includes(name)) continue;
          expect(data, `${c.id} の効果文の「${name}」`).toContain(`"${token.id}"`);
        }
      }
    }
  });
});
