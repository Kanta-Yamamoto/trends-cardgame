import { layoutViewport } from "./viewport";

/**
 * 画面の枠：すべての画面と演出を「スマホの縦の画面」1つの中だけで出すための、アプリの一番外側の箱（#app-frame）。
 *
 * オーナーの決まり：PC 用の画面は作らない。PC でもスマホの横持ちでも、縦の画面を中央に置き、その中だけで動かす。
 * - スマホの縦（幅 480px まで）：枠は何もしない。ページのスクロール・全画面の要素・演出の層は、枠を入れる前と同じ
 *   （10月23日：スマホで枠に transform を持たせ、演出の層を枠の中へ移したら、PixiJS の演出が出なくなった）
 * - それより広い画面（PC・横持ち）：枠（幅 480px・高さは画面いっぱい・中央）に transform を持たせ、中の position: fixed
 *   （モーダル・全画面の演出・カットイン）が枠いっぱいに収まるようにする。スクロールは枠の中の .app-scroll
 *   （本物のスクロールバーは枠の幅を取るので消し、スクロールしている間だけ細い印を重ねる。AppScroll.tsx）
 * - 演出の層（#fx-layer）は、どちらでも body の直下に画面いっぱいに置き、広い画面だけ枠の外を切る。
 *   PixiJS の #fx-stage も body の直下。スマホの縦は画面いっぱい、広い画面は Canvas そのものを枠の大きさにする（fx/stage.ts）
 * - 大きさ・位置は、どちらでも frameSize()・frameRect() で測る（window.innerWidth を直接使わない）
 */

export const FRAME_ID = "app-frame";
/** 枠の幅の上限（app.css の .app-frame と合わせる） */
export const FRAME_MAX = 480;

/** 枠の要素（無ければ body。テストなど） */
export function appFrame(): HTMLElement {
  return document.getElementById(FRAME_ID) ?? document.body;
}

/** 枠の大きさ（レイアウト上の幅と高さ。iPhone で拡大されても変わらない） */
export function frameSize(): { width: number; height: number } {
  const { width, height } = layoutViewport();
  return { width: Math.min(width, FRAME_MAX), height };
}

/** 枠の画面上の四角（ブラウザの画面の座標）。枠は中央に置く */
export function frameRect(): DOMRect {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const { width, height } = frameSize();
  const w = Math.min(width, vw);
  return new DOMRect((vw - w) / 2, 0, w, height);
}

/** 枠の位置と大きさを CSS 変数（--frame-x・--frame-y・--frame-w）に書き、画面の大きさが変わるたびに書き直す */
export function watchFrame() {
  const put = () => {
    const r = frameRect();
    const root = document.documentElement.style;
    root.setProperty("--frame-x", `${r.left}px`);
    root.setProperty("--frame-y", `${r.top}px`);
    root.setProperty("--frame-w", `${r.width}px`);
  };
  put();
  window.addEventListener("resize", put);
  window.addEventListener("orientationchange", () => setTimeout(put, 300));
}
