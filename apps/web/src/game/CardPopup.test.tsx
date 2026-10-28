import { fireEvent, render, screen } from "@testing-library/react";
import { CARDS } from "@trends/cards";
import { describe, expect, it, vi } from "vitest";
import { CardPopup } from "./CardPopup";

const plain = CARDS.find((c) => !c.token && !c.dark);
const darkable = CARDS.find((c) => !c.token && c.dark);
if (!plain || !darkable) throw new Error("闇堕ちを持つカードと持たないカードがいる前提");

describe("カードの拡大の小窓（CardPopup）", () => {
  it("闇堕ちを持つカードだけ、姿の切り替えを出す", () => {
    const { unmount } = render(<CardPopup card={plain} onClose={() => {}} />);
    expect(screen.queryByRole("tab", { name: "闇堕ちの姿" })).toBeNull();
    unmount();
    render(<CardPopup card={darkable} onClose={() => {}} />);
    const tab = screen.getByRole("tab", { name: "闇堕ちの姿" });
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });

  it("外側・×・Esc で閉じる", () => {
    const onClose = vi.fn();
    render(<CardPopup card={plain} onClose={onClose} />);
    for (const b of screen.getAllByRole("button", { name: "閉じる" })) fireEvent.click(b);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("前後へ移れる。端では押せない", () => {
    const prev = vi.fn();
    const next = vi.fn();
    render(<CardPopup card={plain} nav={{ index: 1, total: 3, prev, next }} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "‹ 前へ" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "次へ ›" }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(next).toHaveBeenCalledTimes(2);
    expect(prev).not.toHaveBeenCalled();
  });
});
