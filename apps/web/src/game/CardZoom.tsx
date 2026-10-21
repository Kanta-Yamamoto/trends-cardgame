import type { CardDef } from "@trends/cards";
import type { UnitView } from "@trends/game-core";
import { gsap } from "gsap";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META, stars } from "../cards/meta";
import { HELP } from "../help/help";

/**
 * カードを画面いっぱいに大きく見せる（スマホで効果を読むため）。
 * 場のアイコンなら、今の攻撃力・体力・状態も添える。カードを押すと文字を隠して絵だけを見られる。
 * darkPreview のときは、闇堕ちを持つカードの「闇堕ちすると」の姿と効果を添え、絵も切り替えられる
 * （対戦中もカード一覧でも）。initialDark で最初から闇堕ちの姿で開く。
 */
export function CardZoom({
  card,
  view,
  darkPreview = false,
  initialDark = false,
  onClose,
}: {
  card: CardDef;
  view?: UnitView;
  darkPreview?: boolean;
  initialDark?: boolean;
  onClose: () => void;
}) {
  const [textHidden, setTextHidden] = useState(false);
  const [showDark, setShowDark] = useState(initialDark);
  const isDarkUnit = !!view?.unit.dark;
  // まだ闇堕ちしていないカードの、闇堕ちの姿を見られるか
  const canPreview = darkPreview && !!card.dark && !isDarkUnit;
  const previewing = canPreview && showDark;
  const dark = !!card.dark && (isDarkUnit || previewing);
  const name = dark ? card.dark?.name : card.name;
  const effect = dark ? (card.dark?.effect ?? "") : card.effect;
  // 闇堕ちの姿を試しに見ているときは、場の今の値ではなく闇堕ちの姿の値を出す
  const live = previewing ? undefined : view;
  const keywords = live?.keywords ?? (dark ? (card.dark?.keywords ?? []) : card.keywords);

  const root = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const big = card.rarity >= 4;

  // 開く：溜め（少し縮む）→ 解放（一気に大きく・少し行き過ぎる）→ 衝撃（輪と光の筋・光が走る）→ 余韻（ゆっくり落ち着く・説明が流れ込む）
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const q = (sel: string) => el.querySelectorAll<HTMLElement>(sel);
    const t = gsap.timeline();
    t.fromTo(q(".zoom-sheet-bg"), { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out" }, 0)
      .fromTo(
        q(".zoom-sheet-card"),
        { opacity: 0, scale: 0.62, y: 36, rotationX: 22, transformPerspective: 900, filter: "brightness(2)" },
        { opacity: 1, scale: 0.56, y: 30, duration: 0.1, ease: "power1.in" },
        0,
      )
      .to(
        q(".zoom-sheet-card"),
        { scale: 1.06, y: -4, rotationX: 0, filter: "brightness(1.25)", duration: 0.3, ease: "expo.out" },
        0.1,
      )
      .to(
        q(".zoom-sheet-card"),
        {
          scale: 1,
          y: 0,
          filter: "brightness(1)",
          duration: 0.45,
          ease: "sine.out",
          clearProps: "filter,transform",
        },
        0.4,
      )
      .fromTo(
        q(".zs-ring"),
        { opacity: 0.9, scale: 0.5 },
        { opacity: 0, scale: big ? 1.9 : 1.5, duration: 0.6, ease: "expo.out" },
        0.12,
      )
      .fromTo(
        q(".zs-glare"),
        { xPercent: -130, opacity: 1 },
        { xPercent: 130, duration: 0.55, ease: "power2.inOut" },
        0.24,
      )
      .fromTo(
        q(".zoom-sheet-text"),
        { opacity: 0, x: 28 },
        { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" },
        0.2,
      )
      .fromTo(
        q(".zoom-sheet-text > *"),
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          ease: "power3.out",
          stagger: 0.035,
          clearProps: "opacity,transform",
        },
        0.24,
      );
    if (big) {
      t.fromTo(
        q(".zs-rays"),
        { opacity: 0, scale: 0.6, rotation: -20 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: "expo.out" },
        0.1,
      ).to(q(".zs-rays"), { opacity: 0.35, rotation: 25, duration: 2.4, ease: "sine.out" }, 0.6);
    }
    return () => {
      t.kill();
    };
  }, [big]);

  // 閉じる：少し沈んでから、すっと消える
  const close = useCallback(() => {
    const el = root.current;
    if (closing.current) return;
    closing.current = true;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    const q = (sel: string) => el.querySelectorAll<HTMLElement>(sel);
    gsap
      .timeline({ onComplete: onClose })
      .to(q(".zoom-sheet-card"), { scale: 0.9, y: 24, opacity: 0, duration: 0.18, ease: "power2.in" }, 0)
      .to(q(".zoom-sheet-text, .zs-rays"), { opacity: 0, duration: 0.14, ease: "power1.in" }, 0)
      .to(q(".zoom-sheet-bg"), { opacity: 0, duration: 0.2, ease: "power1.in" }, 0.04);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const tint = ATTR_META[card.attributes[0] as keyof typeof ATTR_META]?.color ?? "#c9d3e0";

  return (
    <div
      ref={root}
      className={`zoom-sheet ${big ? "is-big" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} を拡大`}
      style={{ "--zs-tint": tint } as CSSProperties}
    >
      <button type="button" className="zoom-sheet-bg" aria-label="閉じる" onClick={close} />
      <div className="zoom-sheet-body">
        <div className="zoom-sheet-card">
          <span className="zs-rays" aria-hidden="true" />
          <span className="zs-ring" aria-hidden="true" />
          <span className="zs-glare-clip" aria-hidden="true">
            <span className="zs-glare" />
          </span>
          <HoloCard
            darkForm={dark}
            card={card}
            interactive
            idle={false}
            textHidden={textHidden}
            onClick={() => setTextHidden((v) => !v)}
          />
        </div>
        <div className="zoom-sheet-text">
          <p className="zs-meta">
            {card.type === "icon" ? "アイコン" : "投稿"}・{stars(card.rarity)}・コスト {card.cost}
          </p>
          <h2>
            {!dark && card.epithet && <small>{card.epithet}</small>}
            {name}
            {dark && <small className="zs-dark">闇堕ちの姿</small>}
          </h2>
          <AttrChips card={card} />
          {card.type === "icon" && (
            <p className="zs-stats">
              攻撃力 <b className="t-atk">{live?.attack ?? (dark ? card.dark?.attack : card.attack)}</b>
              <span>・</span>
              体力 <b className="t-hp">{live ? live.hp : dark ? card.dark?.hp : card.hp}</b>
              {live && live.hp < live.maxHp && <span className="zs-max">／{live.maxHp}</span>}
            </p>
          )}
          {effect && (
            <p className="zs-effect">
              <EffectText text={effect} />
            </p>
          )}
          {keywords.length > 0 && (
            <dl className="zs-keywords">
              {keywords.map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{HELP[k]?.text}</dd>
                </div>
              ))}
            </dl>
          )}
          {live && (live.exposed || live.unit.exposeAtTurnEnd || live.asleep || live.unit.silenced) && (
            <ul className="zs-states">
              {live.exposed && <li>晒し者：ガードを失い、それまでの強化が消えた</li>}
              {live.unit.exposeAtTurnEnd && <li>炎上商法：このターンの終わりに晒し者になる</li>}
              {live.asleep && <li>眠っている：このターンは攻撃できない</li>}
              {live.unit.silenced && <li>訂正済み：キーワードと効果が消えている</li>}
            </ul>
          )}
          {canPreview && card.dark && !previewing && (
            <div className="zs-darkbox">
              <p className="zs-darkbox-head">
                闇堕ちすると <b>{card.dark.name}</b>
                <span className="zs-darkbox-stats">
                  <b className="t-atk">{card.dark.attack}</b>／<b className="t-hp">{card.dark.hp}</b>
                </span>
              </p>
              <p className="zs-darkbox-effect">
                <EffectText text={card.dark.effect} />
              </p>
              <p className="zs-note">
                オワコンになったら、次の自分のターンの始めに、コストなしでこの姿で自動で戻ってくる（出たターンは相手のアイコンにだけ攻撃できる）。この姿がオワコンになったら消える
              </p>
            </div>
          )}
          {canPreview && (
            <button type="button" className="btn ghost" onClick={() => setShowDark((v) => !v)}>
              {showDark ? "元の姿に戻す" : "闇堕ちの姿を見る"}
            </button>
          )}
          <p className="zs-note">カードを押すと、文字を隠して絵だけを見られます</p>
          <button type="button" className="btn" onClick={close}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
