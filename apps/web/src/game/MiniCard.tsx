import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { useRef } from "react";
import { ATTR_META, attrBackground, stars } from "../cards/meta";

interface Props {
  card: CardDef;
  /** 場のアイコンの今の姿（効果・ダメージ・闇堕ちを反映したもの） */
  view?: UnitView;
  /** 表示するコスト。省略すると出さない */
  cost?: number;
  /** 演出で要素を探すための目印 */
  uid?: number;
  inHand?: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
  onClick?: () => void;
  onPeek?: () => void;
  /** 長押し（スマホ）・右クリック（PC）で呼ぶ。カードを大きく見るのに使う */
  onLongPress?: () => void;
  children?: React.ReactNode;
}

const LONG_PRESS_MS = 450;

/** 対戦画面の手札・場で使う小さいカード。イラストがあれば背景に敷き、なければ属性の色で塗る */
export function MiniCard({
  card,
  view,
  cost,
  uid,
  inHand,
  className = "",
  disabled,
  label,
  onClick,
  onPeek,
  onLongPress,
  children,
}: Props) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  const dark = view?.unit.dark ?? false;
  const bg =
    card.art && !dark ? { backgroundImage: `url(${card.art})` } : { background: attrBackground(card) };
  const name = view?.name ?? card.name;
  const keywords = view?.keywords ?? card.keywords;
  const attack = view?.attack ?? card.attack ?? 0;
  const hp = view?.hp ?? card.hp ?? 0;
  const hurt = view ? view.hp < view.maxHp : false;
  const isPost = card.type === "post";
  return (
    <button
      type="button"
      className={`mini ${card.art && !dark ? "has-art" : ""} ${dark ? "is-dark" : ""} ${isPost ? "is-post" : ""} ${className}`}
      style={bg}
      data-uid={uid}
      data-hand-card={inHand ? "" : undefined}
      disabled={disabled}
      aria-label={
        label ??
        (isPost
          ? `${name}（投稿・コスト${cost ?? card.cost}）`
          : `${name}（コスト${cost ?? card.cost}・攻撃${attack}・体力${hp}）`)
      }
      onClick={() => {
        // 長押しで拡大したあとの指を離した操作は、選択として扱わない
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onClick?.();
      }}
      onPointerDown={() => {
        if (!onLongPress) return;
        longPressed.current = false;
        cancel();
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        if (!onLongPress) return;
        e.preventDefault();
        if (!longPressed.current) onLongPress();
      }}
      onPointerEnter={onPeek}
      onFocus={onPeek}
    >
      {cost !== undefined && (
        <span
          className={`mini-cost ${cost < card.cost ? "down" : ""}`}
          title={cost < card.cost ? `元のコスト ${card.cost}` : undefined}
        >
          {cost}
        </span>
      )}
      <span className="mini-top">
        <span className="mini-attrs" aria-hidden="true">
          {card.attributes.length === 0 && <i style={{ background: "#d5dae3", color: "#2b3240" }}>共</i>}
          {card.attributes.map((a) => (
            <i key={a} style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}>
              {ATTR_META[a].mark}
            </i>
          ))}
        </span>
        <span className="mini-stars">{stars(card.rarity)}</span>
      </span>
      {card.dark && !dark && <span className="mini-darkmark">闇堕ち</span>}
      <span className="mini-name">
        {card.epithet && !dark && <small>{card.epithet}</small>}
        {name}
      </span>
      {(keywords.length > 0 || isPost || view) && (
        <span className="mini-kws">
          {isPost && <span className="mini-kw post">投稿</span>}
          {keywords.map((k) => (
            <span key={k} className="mini-kw">
              {k}
            </span>
          ))}
          {view?.exposed && <span className="mini-kw st">晒し</span>}
          {view?.asleep && <span className="mini-kw st">眠り</span>}
          {view?.unit.silenced && <span className="mini-kw st">訂正</span>}
        </span>
      )}
      {!isPost && (
        <span className="mini-stats">
          <span className="mini-atk" title="攻撃力">
            {attack}
          </span>
          <span key={hp} className={`mini-hp ${hurt ? "hurt" : ""}`} title="体力">
            {hp}
          </span>
        </span>
      )}
      {children}
    </button>
  );
}
