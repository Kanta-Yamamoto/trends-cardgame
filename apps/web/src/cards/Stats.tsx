import type { CardDef } from "@trends/cards";

/** 攻撃力（赤）と体力（青）。damage を渡すと残りの体力を表示する */
export function Stats({ card, damage = 0 }: { card: CardDef; damage?: number }) {
  const left = card.hp - damage;
  return (
    <span className="stats">
      <span className="stat stat-atk" title="攻撃力">
        <small>攻撃</small>
        <b>{card.attack}</b>
      </span>
      <span className={`stat stat-hp ${damage > 0 ? "hurt" : ""}`} title="体力">
        <small>体力</small>
        <b>{left}</b>
      </span>
    </span>
  );
}
