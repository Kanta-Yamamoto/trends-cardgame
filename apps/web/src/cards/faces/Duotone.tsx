import type { CardDef } from "@trends/cards";
import { useEffect, useRef } from "react";
import { MID, type Scene, scenes, shapeAt, slash, toClip } from "../directorMotion";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import "../duotone.css";

/** 名前・効果・数値。二色の境目で文字の色を反転させるため、同じものを 2 枚重ねる */
function Ui({ card, en, inverse }: { card: CardDef; en: string; inverse?: boolean }) {
  return (
    <div className={`layer duo-ui ${inverse ? "inv" : ""}`} aria-hidden={inverse || undefined}>
      <div className="duo-cost">{card.cost}</div>
      <div className="duo-stars">{stars(card.rarity)}</div>
      <div className="duo-plate">
        <div className="duo-name">
          <h3>{card.name}</h3>
          <span className="duo-en">{en}</span>
        </div>
        <p className="duo-effect">{inverse ? card.effect : <EffectText text={card.effect} />}</p>
        <div className="duo-foot">
          <span className="duo-kind">ICON · 共通</span>
          <span className="duo-stats">
            <i className="a" title="攻撃力">
              {card.attack ?? 0}
            </i>
            <i className="h" title="体力">
              {card.hp ?? 0}
            </i>
          </span>
        </div>
      </div>
    </div>
  );
}

const S = scenes();
/** 出たとき：地に斜線が降りてきて止まる */
const ENTER: Scene[] = [S.IN];
/** そのあとの繰り返し：止まる → 降り切って主色 → 幕が回って閉じて地の色 → また降りてきて止まる */
const LOOP: Scene[] = [S.HOLD, S.OUT, S.FULL, S.CURTAIN, S.CLOSE, S.IN];
const LOOP_MS = LOOP.reduce((a, s) => a + s.d, 0);
const ENTER_MS = ENTER.reduce((a, s) => a + s.d, 0);

/**
 * 運営サイドの二色のカード面（基準：『演出家』。Project の docs/design-standard-director.md）。
 * 主色と地の色の2色だけ。人物は切り抜いて下を地に溶かす。境目の斜線が動き、文字は境目で色が反転する。
 * 色と絵はカードごとの CSS（duotone.css の .s-director・.s-fixer）で決める。
 * 動くのは触れるカード（拡大表示）だけ。一覧などでは、斜線が顔の高さで止まった二色のまま。
 */
export function DuotoneFace({ card, en }: { card: CardDef; en: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const layers = el.querySelectorAll<HTMLElement>(".duo-main, .duo-ui.inv");
    const paint = (clip: string) => {
      for (const l of layers) l.style.clipPath = clip;
    };
    const rest = toClip(slash(MID));
    const live = el.closest(".card")?.classList.contains("is-live");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!live || reduce) {
      paint(rest);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = now - t0;
      const shape = t < ENTER_MS ? shapeAt(ENTER, t) : shapeAt(LOOP, (t - ENTER_MS) % LOOP_MS);
      paint(shape ? toClip(shape) : rest);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="card-inner" ref={root}>
      <div className="layer duo-main" />
      <div className="layer duo-sub" />
      <Ui card={card} en={en} />
      <Ui card={card} en={en} inverse />
    </div>
  );
}
