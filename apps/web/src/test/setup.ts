import "@testing-library/jest-dom/vitest";

// jsdom にないブラウザ API の最低限の代用
class RO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia;
