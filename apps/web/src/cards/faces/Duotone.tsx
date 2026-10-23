import type { CardDef } from "@trends/cards";
import { useEffect, useRef } from "react";
import { MID, type Scene, scenes, shapeAt, slash, toClip } from "../directorMotion";
import { EffectText } from "../EffectText";
import { paintMask } from "../inkBleed";
import { stars } from "../meta";
import "../duotone.css";

/** 名前・効果・数値。二色の境目で文字の色を反転させるため、同じものを 2 枚重ねる */
function Ui({ card, inverse }: { card: CardDef; inverse?: boolean }) {
  return (
    <div className={`layer duo-ui ${inverse ? "inv" : ""}`} aria-hidden={inverse || undefined}>
      <div className="duo-cost">{card.cost}</div>
      <div className="duo-stars">{stars(card.rarity)}</div>
      <div className="duo-plate">
        <div className="duo-name">
          <h3>{card.name}</h3>
        </div>
        <p className="duo-effect">{inverse ? card.effect : <EffectText text={card.effect} />}</p>
        <div className="duo-foot">
          <span className="duo-kind">キャラクター・ニュートラル</span>
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

/** 主色の層と反転の文字の層への塗り方：形で切る（clip-path）か、濃さで隠す（mask-image） */
export type DuoPaint = { clip: string } | { mask: string };

/**
 * 境目の動き。カードごとに違う（『演出家』は斜線と幕、『フィクサー』は白から黒への滲み）。
 * frame は出てから t ミリ秒の塗り方（w・h は層の大きさ px）。endMs があれば、その時刻の形で止める
 */
export interface DuoMotion {
  frame: (t: number, w: number, h: number) => DuoPaint;
  /** 止まっているとき（一覧など） */
  rest: (w: number, h: number) => DuoPaint;
  endMs?: number;
}

const S = scenes();
/** 出たとき：地に斜線が降りてきて止まる */
const ENTER: Scene[] = [S.IN];
/** そのあとの繰り返し：止まる → 降り切って主色 → 幕が回って閉じて地の色 → また降りてきて止まる */
const LOOP: Scene[] = [S.HOLD, S.OUT, S.FULL, S.CURTAIN, S.CLOSE, S.IN];
const LOOP_MS = LOOP.reduce((a, s) => a + s.d, 0);
const ENTER_MS = ENTER.reduce((a, s) => a + s.d, 0);

/** 『演出家』の動き（基準） */
export const DIRECTOR_MOTION: DuoMotion = {
  rest: () => ({ clip: toClip(slash(MID)) }),
  frame: (t) => {
    const shape = t < ENTER_MS ? shapeAt(ENTER, t) : shapeAt(LOOP, (t - ENTER_MS) % LOOP_MS);
    return { clip: toClip(shape ?? slash(MID)) };
  },
};

/**
 * 運営サイドの二色のカード面（基準：『演出家』。Project の docs/design-standard-director.md）。
 * 主色と地の色の2色だけ。人物は切り抜いて下を地に溶かす。境目が動き、文字は境目で色が反転する。
 * 色と絵はカードごとの CSS（duotone.css の .s-director・.s-fixer）、境目の動きは motion で決める。
 * 動くのは触れるカード（拡大表示）だけ。一覧などでは止まった姿のまま。
 */
export function DuotoneFace({ card, motion }: { card: CardDef; motion: DuoMotion }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const layers = el.querySelectorAll<HTMLElement>(".duo-main, .duo-ui.inv");
    const size = () => ({ w: el.offsetWidth, h: el.offsetHeight });
    const paint = (p: DuoPaint) => {
      for (const l of layers) {
        if ("clip" in p) l.style.clipPath = p.clip;
        else paintMask(l, p.mask);
      }
    };
    const live = el.closest(".card")?.classList.contains("is-live");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!live || reduce) {
      const { w, h } = size();
      paint(motion.rest(w, h));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const { w, h } = size();
      const t = now - t0;
      if (motion.endMs !== undefined && t >= motion.endMs) {
        paint(motion.frame(motion.endMs, w, h));
        return;
      }
      paint(motion.frame(t, w, h));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [motion]);

  return (
    <div className="card-inner" ref={root}>
      <div className="layer duo-main" />
      <div className="layer duo-sub" />
      <Ui card={card} />
      <Ui card={card} inverse />
    </div>
  );
}
