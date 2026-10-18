import type { CardDef } from "@trends/cards";
import { type CSSProperties, useEffect } from "react";

export interface DarkCut {
  id: number;
  cardId: string;
  mine: boolean;
  /** 演出が終わったら呼ぶ（このあと盤面が進む） */
  done: () => void;
}

/** ひびの線（画面の真ん中から外へ） */
const CRACKS = [
  "M50 50 L38 30 L41 18 L30 0",
  "M50 50 L66 34 L72 20 L88 8",
  "M50 50 L74 52 L88 46 L100 54",
  "M50 50 L62 70 L58 86 L66 100",
  "M50 50 L36 64 L22 70 L8 88",
  "M50 50 L28 48 L14 40 L0 44",
];

const DURATION = 2600;

/**
 * 闇堕ちの演出。画面全体が暗くなり、元の推しの絵にひびが入って砕け、闇堕ちの姿が差し込む。
 * 自分・相手どちらの闇堕ちでも出す。押すと飛ばせる
 */
export function DarkCutscene({
  card,
  mine,
  ownerName,
  onDone,
}: {
  card: CardDef;
  mine: boolean;
  ownerName: string;
  onDone: () => void;
}) {
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const t = window.setTimeout(onDone, reduce ? 900 : DURATION);
    return () => window.clearTimeout(t);
  }, [onDone, reduce]);
  const vars = {
    "--from": card.art ? `url(${card.art})` : "none",
    "--to": card.dark?.art ? `url(${card.dark.art})` : card.art ? `url(${card.art})` : "none",
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`dark-cut ${mine ? "mine" : "foe"} ${reduce ? "reduced" : ""}`}
      style={vars}
      onClick={onDone}
      aria-label={`${ownerName}の推し ${card.name} が闇堕ちした（押すと飛ばせます）`}
    >
      <span className="dc-veil" />
      <span className="dc-flames" />
      <span className="dc-portrait">
        <span className="dc-art dc-from" />
        <svg className="dc-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {CRACKS.map((d) => (
            <path key={d} d={d} pathLength={1} />
          ))}
        </svg>
        <span className="dc-art dc-to" />
      </span>
      <span className="dc-flash" />
      <span className="dc-text">
        <small>{ownerName}の推し</small>
        <strong>闇堕ち</strong>
        <em>
          {card.name} → {card.dark?.name ?? card.name}
        </em>
      </span>
      <span className="dc-skip">押すと飛ばせます</span>
    </button>
  );
}
