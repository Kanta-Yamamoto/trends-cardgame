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
    expect(screen.getByRole("img", { name: /炎上系配信者 レン/ })).toBeInTheDocument();
    expect(container.querySelector(".stat-atk")).toHaveTextContent("5");
    expect(container.querySelector(".stat-hp")).toHaveTextContent("4");
    expect(screen.getByText("No. 007 / 100")).toBeInTheDocument();
  });
});

describe("イラストのないカード", () => {
  it("専用デザインがなければ共通デザインで表示する", () => {
    const guard = CARDS.find((c) => c.id === "i3");
    if (!guard) throw new Error("i3 not found");
    const { container } = render(<HoloCard card={guard} idle={false} />);
    expect(container.querySelector(".kg")).not.toBeNull();
    expect(screen.getByText("柴犬")).toBeInTheDocument();
    expect(container.querySelector(".stat-atk")).toHaveTextContent("2");
    expect(container.querySelector(".stat-hp")).toHaveTextContent("3");
  });

  it("効果文が先頭のキーワードで始まっても重複キーにならない", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<EffectText text="ガード（相手はこのカードから攻撃しないといけない）" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
