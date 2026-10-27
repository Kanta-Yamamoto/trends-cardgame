import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 新しい版に自動で切り替える（pwa.ts）。本番の Web のときだけ動くので、本番のふりをして確かめる
describe("新しい版に自動で切り替える", () => {
  let reload: ReturnType<typeof vi.fn>;
  let build: string;
  const realLocation = window.location;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    sessionStorage.clear();
    build = "next";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ build }) })),
    );
    reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, reload } });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  /** pwa.ts を読み込み直し（覚えている状態を空にして）、ホーム画面の代わりを返す */
  async function load() {
    const pwa = await import("./pwa");
    pwa.registerPwa();
    function HomeLike() {
      pwa.useReloadWhenNewer();
      return null;
    }
    return HomeLike;
  }
  const flush = () => act(async () => {});
  const comeBack = () => act(async () => void document.dispatchEvent(new Event("visibilitychange")));

  it("ホーム画面にいて、新しい版が出ていれば読み直す", async () => {
    const HomeLike = await load();
    render(<HomeLike />);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("同じ版なら読み直さない", async () => {
    build = __BUILD_ID__;
    const HomeLike = await load();
    render(<HomeLike />);
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });

  it("ホーム画面でなければ読み直さず、ホームに来たときに読み直す", async () => {
    const HomeLike = await load();
    await comeBack();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    render(<HomeLike />);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("確かめている間に画面を触ったら、読み直さない", async () => {
    let answer: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (answer = r))),
    );
    const HomeLike = await load();
    render(<HomeLike />);
    await new Promise((r) => setTimeout(r, 2));
    document.dispatchEvent(new Event("pointerdown"));
    await act(async () => answer({ ok: true, json: async () => ({ build }) }));
    expect(reload).not.toHaveBeenCalled();
  });

  it("同じ版のための読み直しは 1 回だけ（読み直しても前の版のままなら繰り返さない）", async () => {
    let HomeLike = await load();
    render(<HomeLike />);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    // 読み直した後も前の版のまま（同じタブなので sessionStorage は残る）
    cleanup();
    vi.resetModules();
    HomeLike = await load();
    render(<HomeLike />);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
