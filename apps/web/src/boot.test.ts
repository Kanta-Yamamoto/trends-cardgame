import { afterEach, describe, expect, it, vi } from "vitest";
import { hideBootWhenReady } from "./boot";

describe("起きるまでのローディング", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("サーバーが返事をするまで出しておき、返事が来たら消す", async () => {
    document.body.innerHTML = '<div id="boot"></div>';
    let answer: (v: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (answer = r))),
    );
    vi.useFakeTimers();
    hideBootWhenReady();
    const boot = document.getElementById("boot") as HTMLElement;
    await vi.advanceTimersByTimeAsync(5000);
    expect(boot.classList.contains("out")).toBe(false);
    answer(new Response("{}"));
    await vi.advanceTimersByTimeAsync(0);
    expect(boot.classList.contains("out")).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById("boot")).toBeNull();
  });

  it("つながらないときも、返事を待たずに消す", async () => {
    document.body.innerHTML = '<div id="boot"></div>';
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    hideBootWhenReady();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById("boot")?.classList.contains("out")).toBe(true);
  });
});
