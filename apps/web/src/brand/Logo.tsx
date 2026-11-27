import { LOGO_INK, LOGO_ROW, LOGO_SKY, LOGO_STACK } from "./logo";

/**
 * ゲームのロゴ「BUZZ NOIR」（11月27日）。使い分けはオーナーの決め：
 * - stack（2 段）：1 層。文字の 1 色だけ（色は CSS の color。決めていなければ紺）。ログイン・ホーム・起動のローディング
 * - row（横 1 行）：2 層。BUZZ は紺の帯・NOIR は水色の帯で、文字と地の色を入れ替える。細い場所や、地の上で読みにくい場所（名前を決める画面・ガチャのパック）
 * 大きさは CSS の width で決める（高さは比率どおり）。label を渡さなければ、飾りとして読み上げない
 */
export function BrandLogo({
  layout = "stack",
  className,
  label,
}: {
  layout?: "stack" | "row";
  className?: string;
  /** 読み上げる名前（見出しとして置くときに渡す） */
  label?: string;
}) {
  // 見出しとして置くときは読み上げ、飾りのときは読み上げない
  const hidden = label ? undefined : true;
  const title = label ?? "BUZZ NOIR";
  if (layout === "row") {
    const L = LOGO_ROW;
    return (
      <svg
        className={`brand-logo row${className ? ` ${className}` : ""}`}
        viewBox={`0 0 ${L.width} ${L.height}`}
        role="img"
        aria-hidden={hidden}
      >
        <title>{title}</title>
        <rect width={L.band} height={L.height} fill={LOGO_INK} />
        <rect x={L.band} width={L.band} height={L.height} fill={LOGO_SKY} />
        <path d={L.buzz} fill={LOGO_SKY} />
        <path d={L.noir} fill={LOGO_INK} />
      </svg>
    );
  }
  const L = LOGO_STACK;
  return (
    <svg
      className={`brand-logo stack${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${L.width} ${L.height}`}
      role="img"
      aria-hidden={hidden}
    >
      <title>{title}</title>
      <path d={L.buzz} fill="currentColor" />
      <path d={L.noir} fill="currentColor" />
    </svg>
  );
}
