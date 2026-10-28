/**
 * タップの印（10月28日。オーナー：「システム全体で押したときに小さい何かを出すことを検討できる？」
 * → モックの案から「ふわっと光るにしましょう、そしてもう少しだけ大きく」）。
 * どの画面でも、押した所がやわらかい光の円で一瞬だけ明るくなる（見た目は app.css の .tap-mark）。
 * 押したものの動きは変えず、上に重ねるだけ。印は body の直下に置き、押した点（画面の座標）にそのまま出す
 */
export function watchTaps() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isPrimary) return;
      const el = document.createElement("span");
      el.className = "tap-mark";
      el.setAttribute("aria-hidden", "true");
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      el.addEventListener("animationend", () => el.remove(), { once: true });
      // 画面を隠しているあいだは animationend が来ないことがあるので、念のため消す
      setTimeout(() => el.remove(), 1000);
      document.body.append(el);
    },
    { capture: true, passive: true },
  );
}
