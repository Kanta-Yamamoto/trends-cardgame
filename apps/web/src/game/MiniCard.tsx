import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { type CSSProperties, useRef } from "react";
import { HelpTerm } from "../cards/EffectText";
import { ATTR_META, attrBackground, KAIWAI_META, stars } from "../cards/meta";

interface Props {
  card: CardDef;
  /** 場のアイコンの今の姿（効果・ダメージ・闇堕ちを反映したもの） */
  view?: UnitView;
  /** 表示するコスト。省略すると出さない */
  cost?: number;
  /** 演出で要素を探すための目印 */
  uid?: number;
  inHand?: boolean;
  /** 場のアイコン：絵と数値だけの簡素な見た目（名前・属性・★・闇堕ちの印は出さない。ガードと状態だけ） */
  onField?: boolean;
  className?: string;
  /** 追加のスタイル（手札の扇の並びなど） */
  style?: CSSProperties;
  disabled?: boolean;
  label?: string;
  onClick?: () => void;
  onPeek?: () => void;
  /** 長押し（スマホ）・右クリック（PC）で呼ぶ。カードを大きく見るのに使う */
  onLongPress?: () => void;
  /** 押し始め（ドラッグで出す・攻撃するのに使う） */
  onPress?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** ドロップ先の目印（useDragPlay が読む） */
  drop?: string;
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
  onField = false,
  className = "",
  style,
  disabled,
  label,
  onClick,
  onPeek,
  onLongPress,
  onPress,
  drop,
  children,
}: Props) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const longPressed = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  const dark = view?.unit.dark ?? false;
  // 闇堕ちしたら闇堕ちの絵（無ければ元の絵に紫の影をかける）
  const art = dark ? (card.dark?.art ?? card.art) : card.art;
  const bg = art ? { backgroundImage: `url(${art})` } : { background: attrBackground(card) };
  const name = view?.name ?? card.name;
  const keywords = view?.keywords ?? card.keywords;
  const attack = view?.attack ?? card.attack ?? 0;
  const hp = view?.hp ?? card.hp ?? 0;
  const hurt = view ? view.hp < view.maxHp : false;
  const isPost = card.type === "post";
  return (
    <button
      type="button"
      className={`mini ${art ? "has-art" : ""} ${dark ? "is-dark" : ""} ${isPost ? "is-post" : ""} ${onField ? "on-field" : ""} ${className}`}
      style={{ ...bg, ...style }}
      data-uid={uid}
      data-hand-card={inHand ? "" : undefined}
      data-drop={drop}
      disabled={disabled}
      aria-label={
        label ??
        (isPost
          ? `${name}（投稿・コスト${cost ?? card.cost}）`
          : `${name}（${[...card.attributes, ...card.kaiwai.map((k) => `${k}界隈`)].join("・") || "共通"}・コスト${cost ?? card.cost}・攻撃${attack}・体力${hp}）`)
      }
      onClick={() => {
        // 長押しで拡大したあとの指を離した操作は、選択として扱わない
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onClick?.();
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        onPress?.(e);
        if (!onLongPress) return;
        longPressed.current = false;
        cancel();
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        // 引っぱり始めたら長押しにしない
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
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
      {!onField && (
        <span className="mini-top">
          <span className="mini-attrs" aria-hidden="true">
            {card.attributes.length === 0 && <i style={{ background: "#d5dae3", color: "#2b3240" }}>共</i>}
            {card.attributes.map((a) => (
              <i key={a} style={{ background: ATTR_META[a].color, color: ATTR_META[a].deep }}>
                {ATTR_META[a].mark}
              </i>
            ))}
            {card.kaiwai.map((k) => (
              <b key={k} className="mini-kaiwai" title={`${k}界隈`}>
                {KAIWAI_META[k].mark}
              </b>
            ))}
          </span>
        </span>
      )}
      {!onField && <span className="mini-stars">{stars(card.rarity)}</span>}
      {!onField && card.dark && !dark && <span className="mini-darkmark">闇堕ち</span>}
      {!onField && (
        <span className="mini-name">
          {card.epithet && !dark && <small>{card.epithet}</small>}
          {name}
        </span>
      )}
      {(keywords.length > 0 || view) && (
        <span className="mini-kws">
          {/* 場では本当に要る札だけ：ガードと状態。ほかのキーワードは押して見る */}
          {keywords
            .filter((k) => !onField || k === "ガード")
            .map((k) => (
              <HelpTerm key={k} term={k} className="mini-kw" />
            ))}
          {view?.exposed && (
            <HelpTerm term="晒し者" className="mini-kw st">
              晒し
            </HelpTerm>
          )}
          {view?.asleep && (
            <HelpTerm term="眠り" className="mini-kw st">
              眠り
            </HelpTerm>
          )}
          {view?.unit.silenced && (
            <HelpTerm term="訂正済み" className="mini-kw st">
              訂正
            </HelpTerm>
          )}
        </span>
      )}
      {/* 投稿は攻撃力・体力の代わりに、吹き出しの「投稿」札を出す（アイコンと見分けやすく） */}
      {isPost && <span className="mini-postmark">投稿</span>}
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
