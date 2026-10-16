import type { CardDef } from "@trends/cards";
import { type ComponentType, useEffect, useRef } from "react";
import { GenericFace } from "./faces/Generic";
import { MinamoFace } from "./faces/Minamo";
import { RenFace } from "./faces/Ren";
import { ShiroganeFace } from "./faces/Shirogane";

const FACES: Record<string, { cls: string; Face: ComponentType<{ card: CardDef }> }> = {
  c1: { cls: "k1", Face: ShiroganeFace },
  c2: { cls: "k2", Face: RenFace },
  c3: { cls: "k3", Face: MinamoFace },
};

/** 専用デザインがないカードはテーマ色の共通デザインで描く */
const GENERIC = { cls: "kg", Face: GenericFace };

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** カードの面の傾き・ホロの位置を CSS 変数で動かす（再描画なしで毎フレーム更新） */
export function setTilt(el: HTMLElement, nx: number, ny: number, glow: number) {
  const x = clamp(nx);
  const y = clamp(ny);
  el.style.setProperty("--nx", x.toFixed(3));
  el.style.setProperty("--ny", y.toFixed(3));
  el.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
  el.style.setProperty("--rx", `${(-y * 13).toFixed(2)}deg`);
  el.style.setProperty("--mx", `${(50 + x * 50).toFixed(1)}%`);
  el.style.setProperty("--my", `${(50 + y * 50).toFixed(1)}%`);
  el.style.setProperty("--g", glow.toFixed(2));
}

interface Props {
  card: CardDef;
  /** 触っていないときにゆっくり揺らす */
  idle?: boolean;
  onClick?: () => void;
}

export function HoloCard({ card, idle = true, onClick }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const lastMove = useRef(0);
  const face = FACES[card.id] ?? GENERIC;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const inner = el.querySelector<HTMLElement>(".card-inner");
    const ro = new ResizeObserver(([e]) => {
      if (e && inner) inner.style.setProperty("--w", `${e.contentRect.width}px`);
    });
    ro.observe(el);
    setTilt(el, -0.3, -0.3, 0.4);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const phase = Math.random() * 10;
    const tick = (t: number) => {
      if (idle && !reduce && t - lastMove.current > 2200) {
        const s = t / 1000 + phase;
        setTilt(el, Math.sin(s * 0.8) * 0.5, Math.sin(s * 1.1 + 1) * 0.35, 0.45 + Math.sin(s) * 0.25);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [idle]);

  const { cls, Face } = face;

  const onPointerMove = (e: React.PointerEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    lastMove.current = performance.now();
    setTilt(el, nx, ny, Math.min(1, Math.hypot(nx, ny)));
  };

  const body = (
    <div
      ref={cardRef}
      className="card"
      role="img"
      aria-label={`${card.epithet} ${card.name}（コスト${card.cost}・パワー${card.power}）`}
      onPointerMove={onPointerMove}
    >
      <Face card={card} />
    </div>
  );

  return (
    <div className={`holo ${cls}`} style={{ perspective: 1100 }}>
      {onClick ? (
        <button type="button" className="holo-btn" onClick={onClick}>
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}
