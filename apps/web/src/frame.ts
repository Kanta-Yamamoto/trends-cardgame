/**
 * 画面の枠：すべての画面と演出を「スマホの縦の画面」1つの中だけで出すための、アプリの一番外側の箱（#app-frame）。
 *
 * オーナーの決まり：PC 用の画面は作らない。PC でもスマホの横持ちでも、縦の画面を中央に置き、その中だけで動かす。
 * そこで、ここを根っこで一括で決める（個々の画面や演出で気をつけなくてよいように）。
 * - 枠は幅 480px まで・高さは画面いっぱい。CSS の transform を持たせてあるので、中の position: fixed の要素
 *   （モーダル・全画面の演出・カットイン）は、ブラウザの画面ではなく、この枠いっぱいに広がる。はみ出した分は切る
 * - 演出の層（#fx-layer・PixiJS の #fx-stage）と、指の位置に付いてくる表示（.vp-layer）は、画面座標
 *   （getBoundingClientRect・clientX）で置くので、枠の中で「左上がブラウザの画面の左上」になるようにずらして置く
 *   （--frame-x・--frame-y）。枠の外にはみ出した分は、枠で切られる
 * - スクロールは枠の中の .app-scroll がする（枠そのものは動かない。だからモーダルはスクロールしても枠に止まる）
 */

export const FRAME_ID = "app-frame";

/** 枠の要素（無ければ body。テストなど） */
export function appFrame(): HTMLElement {
  return document.getElementById(FRAME_ID) ?? document.body;
}

/** 枠の画面上の四角（ブラウザの画面の座標） */
export function frameRect(): DOMRect {
  return appFrame().getBoundingClientRect();
}

/** 枠の大きさ（レイアウト上の幅と高さ。iPhone で拡大されても変わらない） */
export function frameSize(): { width: number; height: number } {
  const el = appFrame();
  return { width: el.clientWidth || window.innerWidth, height: el.clientHeight || window.innerHeight };
}

/** 枠の位置を CSS 変数（--frame-x・--frame-y）に書き、画面の大きさが変わるたびに書き直す */
export function watchFrame() {
  const el = document.getElementById(FRAME_ID);
  if (!el) return;
  const put = () => {
    const r = el.getBoundingClientRect();
    document.documentElement.style.setProperty("--frame-x", `${r.left}px`);
    document.documentElement.style.setProperty("--frame-y", `${r.top}px`);
  };
  put();
  window.addEventListener("resize", put);
  window.addEventListener("orientationchange", () => setTimeout(put, 300));
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(put).observe(el);
}
