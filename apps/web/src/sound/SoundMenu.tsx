import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appFrame, frameRect } from "../frame";
import { LEVEL_MAX, type SoundKind } from "./levels";
import { setSoundLevel, useSoundLevels } from "./music";
import { playSe } from "./se";

const WIDTH = 276;
const EDGE = 8;

/** 窓の位置（画面の枠の中の座標） */
interface Place {
  top: number;
  left: number;
  /** 窓の上の三角の位置 */
  tail: number;
}

function placeUnder(button: HTMLElement): Place {
  const r = button.getBoundingClientRect();
  const f = frameRect();
  const center = r.left + r.width / 2 - f.left;
  const left = Math.max(EDGE, Math.min(center - WIDTH / 2, f.width - WIDTH - EDGE));
  return { top: r.bottom + 10, left, tail: center - left };
}

/** 音楽か効果音の大きさの 1 行。− と ＋ のほか、印を押してもその段階になる */
function LevelRow({ kind, label, value }: { kind: SoundKind; label: string; value: number }) {
  const change = (level: number) => {
    setSoundLevel(kind, level);
    // 効果音は、変えた大きさをその場で聞かせる（音楽は流れているので聞こえる）
    if (kind === "se") playSe("summon");
  };
  return (
    <fieldset className="snd-row" aria-label={`${label}の大きさ`}>
      <span className="snd-label">{label}</span>
      <button
        type="button"
        className="snd-step"
        aria-label={`${label}を小さくする`}
        disabled={value === 0}
        onClick={() => change(value - 1)}
      >
        −
      </button>
      <span className="snd-pips">
        {Array.from({ length: LEVEL_MAX }, (_, i) => i + 1).map((level) => (
          <button
            key={level}
            type="button"
            className={level <= value ? "snd-pip on" : "snd-pip"}
            aria-label={`${label} ${level}`}
            aria-pressed={level === value}
            onClick={() => change(level)}
          />
        ))}
      </span>
      <button
        type="button"
        className="snd-step"
        aria-label={`${label}を大きくする`}
        disabled={value === LEVEL_MAX}
        onClick={() => change(value + 1)}
      >
        ＋
      </button>
    </fieldset>
  );
}

/** 音の大きさのボタン。押すと、その下に音楽と効果音の大きさを変える小さな窓が開く（曲の流れる画面に置く。設定は 1 つで、どの画面にも効く） */
export function SoundMenu({ className }: { className: string }) {
  const levels = useSoundLevels();
  const [place, setPlace] = useState<Place | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = place !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPlace(null);
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const silent = levels.bgm === 0 && levels.se === 0;
  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label="音の大きさ"
        aria-expanded={open}
        onClick={() => setPlace(open || !button.current ? null : placeUnder(button.current))}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
          {silent ? (
            <path d="M16 10l4 4M20 10l-4 4" />
          ) : (
            <>
              <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
              <path d="M18.5 7a7 7 0 0 1 0 10" />
            </>
          )}
        </svg>
      </button>
      {place &&
        createPortal(
          <div
            ref={panel}
            className="snd-pop g3"
            role="dialog"
            aria-label="音の大きさ"
            style={{
              top: place.top,
              left: place.left,
              width: WIDTH,
              ["--tail" as string]: `${place.tail}px`,
            }}
          >
            <LevelRow kind="bgm" label="音楽" value={levels.bgm} />
            <LevelRow kind="se" label="効果音" value={levels.se} />
          </div>,
          appFrame(),
        )}
    </>
  );
}
