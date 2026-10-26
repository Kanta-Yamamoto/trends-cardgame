import { costCurve } from "./decks";

const COST_LABELS = ["1", "2", "3", "4", "5", "6", "7+"];

/** コストごとの枚数を数字の列で出す（棒グラフにしない。同じコストばかりのデッキでも形が崩れないように） */
export function CostStrip({ cards }: { cards: readonly string[] }) {
  const curve = costCurve(cards);
  return (
    <div className="cost-strip">
      <span className="cost-strip-lb">コスト</span>
      {COST_LABELS.map((label, i) => (
        <span key={label} className={`cost-strip-v ${curve[i] ? "" : "zero"}`}>
          <small>{label}</small>
          <b>{curve[i] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}
