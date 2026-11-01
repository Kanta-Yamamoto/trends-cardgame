// 場の範囲（相手の場の上の端から、自分の場の下の端まで）。画面座標
// 11月2日の作り直しで、2 つの場をまとめた枠（.pfield）が無くなった。神の降臨・クサハミの伏兵が、場の範囲を測るのに使う

/** 相手の場と自分の場をつつむ範囲。場が見つからなければ null */
export function fieldRect(): { top: number; bottom: number; height: number } | null {
  const rows = [...document.querySelectorAll<HTMLElement>(".pstage .row")].map((r) =>
    r.getBoundingClientRect(),
  );
  if (rows.length === 0) return null;
  const top = Math.min(...rows.map((r) => r.top));
  const bottom = Math.max(...rows.map((r) => r.bottom));
  return { top, bottom, height: bottom - top };
}
