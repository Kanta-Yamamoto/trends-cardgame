import type { CardDef } from "@trends/cards";
import { useEffect, useRef } from "react";
import { MID, type Scene, scenes, shapeAt, slash, toClip } from "../directorMotion";
import { EffectText } from "../EffectText";
import { stars } from "../meta";
import "../director.css";

/** 名前・効果・数値。二色の境目で文字の色を反転させるため、同じものを 2 枚重ねる */
function Ui({ card, inverse }: { card: CardDef; inverse?: boolean }) {
  return (
    <div className={`layer dr-ui ${inverse ? "inv" : ""}`} aria-hidden={inverse || undefined}>
      <div className="dr-cost">{card.cost}</div>
      <div className="dr-stars">{stars(card.rarity)}</div>
      <div className="dr-plate">
        <div className="dr-name">
          <h3>{card.name}</h3>
          <span className="dr-en">DIRECTOR</span>
        </div>
        <p className="dr-effect">{inverse ? card.effect : <EffectText text={card.effect} />}</p>
        <div className="dr-foot">
          <span className="dr-kind">ICON · 共通</span>
          <span className="dr-stats">
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
/** 出たとき：黒い地に斜線が降りてきて止まる */
const ENTER: Scene[] = [S.IN];
/** そのあとの繰り返し：止まる → 降り切って真紅 → 幕が回って閉じて黒 → また降りてきて止まる */
const LOOP: Scene[] = [S.HOLD, S.OUT, S.FULL, S.CURTAIN, S.CLOSE, S.IN];
const LOOP_MS = LOOP.reduce((a, s) => a + s.d, 0);
const ENTER_MS = ENTER.reduce((a, s) => a + s.d, 0);

/**
 * 『演出家』（★5・共通）：真紅と黒の二色だけのカード面。運営サイドのカード面の基準（Project の docs/design-standard-director.md）。
 * 黒はスーツの黒に合わせ、人物は切り抜いて下を地に溶かす。境目の斜線が動き、文字は境目で色が反転する。
 * 動くのは触れるカード（拡大表示）だけ。一覧などでは、斜線が顔の高さで止まった二色のまま。
 */
export function DirectorFace({ card }: { card: CardDef }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const layers = el.querySelectorAll<HTMLElement>(".dr-red, .dr-ui.inv");
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
      <div className="layer dr-red" />
      <div className="layer dr-sub" />
      <Ui card={card} />
      <Ui card={card} inverse />
    </div>
  );
}
