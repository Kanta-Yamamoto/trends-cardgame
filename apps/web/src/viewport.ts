/**
 * スマホの「拡大縮小」を止める。
 *
 * iPhone の Safari は、メタタグの user-scalable=no を無視する（iOS 10〜）。
 * 対戦中は連打が多く、素早い2回タップがダブルタップ拡大、2本指がピンチ拡大になって、
 * 画面が全画面に広がらなかったり、極端に小さくなったりしていた。
 * - ダブルタップ拡大：CSS の touch-action: manipulation（app.css）
 * - ピンチ：Safari だけの gesture イベントと、2本指の touch イベントを止める（ここ）
 * - 向きを変えた直後に倍率が 1 でなくなるのは、viewport を当て直して戻す（resetZoom）
 */

const prevent = (e: Event) => e.preventDefault();
const twoFingers = (e: TouchEvent) => {
  if (e.touches.length > 1) e.preventDefault();
};

let locks = 0;

/** ピンチ拡大を止める。戻す関数を返す（対戦画面を抜けたら戻す） */
export function lockZoom(): () => void {
  if (locks++ === 0) {
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("touchstart", twoFingers, { passive: false });
    document.addEventListener("touchmove", twoFingers, { passive: false });
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--locks > 0) return;
    document.removeEventListener("gesturestart", prevent);
    document.removeEventListener("gesturechange", prevent);
    document.removeEventListener("touchstart", twoFingers);
    document.removeEventListener("touchmove", twoFingers);
  };
}

/** 今の倍率（拡大されていなければ 1） */
export function zoomScale(): number {
  return window.visualViewport?.scale ?? 1;
}

/**
 * 画面の大きさ（拡大の影響を受けない、レイアウト上の幅と高さ）。
 * iOS の window.innerWidth/innerHeight は「拡大後に見えている範囲」なので、
 * そのまま使うと拡大されたときに舞台が縮んでしまう
 */
export function layoutViewport(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (!vv || !(vv.scale > 0)) return { width: window.innerWidth, height: window.innerHeight };
  return { width: Math.round(vv.width * vv.scale), height: Math.round(vv.height * vv.scale) };
}

/** 倍率が 1 でなければ、viewport のメタタグを当て直して 1 に戻す（iPhone で向きを変えた直後の対策） */
export function resetZoom() {
  if (Math.abs(zoomScale() - 1) < 0.01) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.content;
  // 内容を変えると Safari が initial-scale を当て直す。すぐ元に戻す
  meta.content = content.replace("initial-scale=1,", "initial-scale=1.0001,");
  requestAnimationFrame(() => {
    meta.content = content;
  });
}
