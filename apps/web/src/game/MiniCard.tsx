import type { CardDef } from "@trends/cards";

interface Props {
  card: CardDef;
  /** 表示するコスト（補正込み）。省略すると出さない */
  cost?: number;
  /** 場のアイコンが受けているダメージ */
  damage?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
  onClick?: () => void;
  onPeek?: () => void;
  children?: React.ReactNode;
}

/** 対戦画面の手札・場で使う小さいカード。イラストがあれば背景に敷く */
export function MiniCard({
  card,
  cost,
  damage = 0,
  className = "",
  disabled,
  label,
  onClick,
  onPeek,
  children,
}: Props) {
  const art = card.art ? { backgroundImage: `url(${card.art})` } : undefined;
  const hp = card.hp - damage;
  return (
    <button
      type="button"
      className={`mini theme-${card.theme} ${card.art ? "has-art" : ""} ${className}`}
      style={art}
      disabled={disabled}
      aria-label={label ?? `${card.name}（コスト${card.cost}・攻撃${card.attack}・体力${hp}）`}
      onClick={onClick}
      onPointerEnter={onPeek}
      onFocus={onPeek}
    >
      {cost !== undefined && <span className={`mini-cost ${cost < card.cost ? "down" : ""}`}>{cost}</span>}
      <span className="mini-name">{card.name}</span>
      {card.keywords.length > 0 && (
        <span className="mini-kws">
          {card.keywords.map((k) => (
            <span key={k} className="mini-kw">
              {k}
            </span>
          ))}
        </span>
      )}
      <span className="mini-stats">
        <span className="mini-atk" title="攻撃力">
          {card.attack}
        </span>
        <span key={hp} className={`mini-hp ${damage > 0 ? "hurt" : ""}`} title="体力">
          {hp}
        </span>
      </span>
      {children}
    </button>
  );
}
