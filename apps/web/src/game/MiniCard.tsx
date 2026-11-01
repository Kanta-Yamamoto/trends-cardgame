import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { type CSSProperties, useRef } from "react";
import { HelpTerm } from "../cards/EffectText";
import { ATTR_META, attrBackground, KAIWAI_META, stars } from "../cards/meta";

interface Props {
  card: CardDef;
  /** 場のキャラクターの今の姿（効果・ダメージ・闇堕ちを反映したもの） */
  view?: UnitView;
  /** 表示するコスト。省略すると出さない */
  cost?: number;
  /** 演出で要素を探すための目印 */
  uid?: number;
  inHand?: boolean;
  /** 場のキャラクター：絵と数値だけの簡素な見た目（名前・属性・★・闇堕ちの印は出さない。ガードと状態だけ） */
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
  // 強化中（カードの元の値より上がっている）かどうか。数字を淡い金にする
  const base = dark && card.dark ? card.dark : { attack: card.attack ?? 0, hp: card.hp ?? 1 };
  const atkUp = view ? view.attack > base.attack : false;
  const hpUp = view ? view.maxHp > base.hp : false;
  const isPost = card.type === "post";
  return (
    <button
      type="button"
      className={`mini ${art ? "has-art" : ""} ${dark ? "is-dark" : ""} ${isPost ? "is-post" : ""} ${onField ? "on-field" : ""} ${className}`}
      style={{ ...bg, ...style }}
      data-uid={uid}
      data-hand-card={inHand ? "" : undefined}
      data-card={card.id}
      data-drop={drop}
      disabled={disabled}
      aria-label={
        label ??
        (isPost
          ? `${name}（呪文・コスト${cost ?? card.cost}）`
          : `${name}（${[...card.attributes, ...card.kaiwai.map((k) => `${k}界隈`)].join("・") || "ニュートラル"}・コスト${cost ?? card.cost}・攻撃${attack}・体力${hp}）`)
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
            {card.attributes.length === 0 && <i style={{ background: "#d5dae3", color: "#2b3240" }}>ニ</i>}
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
      {!onField && <span className="mini-name">{name}</span>}
      {(keywords.length > 0 || view) && (
        <span className="mini-kws">
          {/* 状態を先に。場の札は押しても解説を開かない（攻撃先を選ぶときの誤タップを防ぐ。解説はシートで見る） */}
          {view?.exposed && <span className="mini-kw st">晒し</span>}
          {view?.unit.exposeAtTurnEnd && <span className="mini-kw st">晒し予告</span>}
          {view?.asleep && <span className="mini-kw st">眠り</span>}
          {view?.unit.silenced && <span className="mini-kw st">沈黙</span>}
          {keywords.map((k) =>
            onField ? (
              <span key={k} className="mini-kw">
                {k}
              </span>
            ) : (
              <HelpTerm key={k} term={k} className="mini-kw" />
            ),
          )}
          {/* 【破壊されたとき】を持つキャラクターには、ドクロの印 */}
          {onField && view?.deathEffect && (
            <span className="mini-kw death mini-skull" title="【破壊されたとき】">
              <SkullIcon />
            </span>
          )}
        </span>
      )}
      {/* 呪文は攻撃力・体力の代わりに、吹き出しの「呪文」札を出す（キャラクターと見分けやすく） */}
      {isPost && <span className="mini-postmark">呪文</span>}
      {!isPost && (
        <span className="mini-stats">
          <span className={`mini-atk ${atkUp ? "up" : ""}`} title="攻撃力">
            {attack}
          </span>
          <span key={hp} className={`mini-hp ${hurt ? "hurt" : ""} ${hpUp ? "up" : ""}`} title="体力">
            {hp}
          </span>
        </span>
      )}
      {children}
    </button>
  );
}

/** ドクロの印（目と鼻は印の地の色でくり抜く） */
function SkullIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.2c-4.9 0-8.4 3.5-8.4 8 0 2.6 1.1 4.5 2.9 5.7v2.9c0 .6.4 1 1 1h1.6v-2.1h1.6v2.1h2.6v-2.1h1.6v2.1h1.6c.6 0 1-.4 1-1v-2.9c1.8-1.2 2.9-3.1 2.9-5.7 0-4.5-3.5-8-8.4-8z"
      />
      <circle cx="8.7" cy="10.7" r="2.2" fill="#0b1018" />
      <circle cx="15.3" cy="10.7" r="2.2" fill="#0b1018" />
      <path fill="#0b1018" d="M12 13.2l-1.3 2.3h2.6z" />
    </svg>
  );
}
