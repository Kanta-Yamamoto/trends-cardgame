import { MINAMO_EPITHET } from "@trends/cards";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { MINAMO_LIVE } from "../fx/minamoLive";
import { CATALOG } from "../game/store";
import { type Face, faceUrl } from "./Guide";
import { Rich } from "./Rich";

/** 導入で映すカード（ミナモ） */
const MINAMO = "c3";
/**
 * 「ネットのあるあるがカードに」で扇に並べるカード（11月1日。Claude の案）。
 * ネットでよく見る人の型・現象から、属性が 1 つずつ（自然・神・推し・炎・水）になるように選んだ。真ん中は★5
 */
const FAN = ["k1", "g2", "m2", "f10", "i1"] as const;
/** 話題の言葉（#カードの名前）を浮かべる位置（画面の幅・高さに対する %）。扇の上と下に散らす */
const TAG_AT = [
  [6, 8],
  [52, 5],
  [60, 47],
  [8, 44],
  [34, 53],
] as const;

/** 導入の時間（ms）。カードを映す → ミナモが引っ込む → カードが下がり、ちびミナモがぽんっと出る → 話しはじめる */
const T_RETRACT = 1500;
const T_POP = 2150;
const T_TALK = 2850;
/** 「対戦へ」を押してから、ちびミナモが左下の丸い枠へ縮んで消えるまで */
export const T_LEAVE = 650;
/** キラカードの場面で、なぞらなくても先へ進めるようになるまで */
const T_KIRA_WAIT = 4500;
/** なぞったと数える指の動き（px） */
const TILT_PX = 70;

/** hello＝あいさつ（大きいちびミナモ）／trends＝カードを扇に並べる／kira＝★5 を 1 枚、指でなぞって傾ける */
type Scene = "hello" | "trends" | "kira";

interface Line {
  scene: Scene;
  face: Face;
  text: string;
  /** ボタンの文字（無ければ「つぎへ」） */
  go?: string;
}

const lines = (name: string): Line[] => [
  { scene: "hello", face: "shy", text: `はじめまして、${name}さん！ **ミナモ**だよ。` },
  {
    scene: "trends",
    face: "open",
    text: "**TRENDS** は、ネットの**“あるある”**がカードになって戦うゲーム！",
  },
  { scene: "kira", face: "point", text: "わたしのカード、**指でなぞって**みて！" },
];
/** キラカードをなぞったあと */
const KIRA_DONE: Line = {
  scene: "kira",
  face: "cheer",
  text: "キラッ！ ★5は1枚ずつ**専用デザイン**なんだ。さっそく対戦しよう！",
  go: "対戦へ",
};

const PHASES = ["card", "retract", "pop", "talk", "leave"] as const;
type Phase = (typeof PHASES)[number];

/**
 * チュートリアルの導入（10月27日。オーナー：「最初にカードのなかのvtuberミナモを写して、そのあとに引っ込めて、
 * 切り抜いたこのちびキャラみなもが出てきて、チュートリアルを説明してくれる」）。
 * 1. カード（0〜1.5 秒）：明るい地に、ミナモのカードがふわっと上がってくる。名前の札（二つ名つき）がポンと出る
 * 2. 引っ込む（1.5 秒〜）：カードの中のミナモが、ひょこっと上の縁の外へ引っ込む（召喚の演出の引っ込み方と同じ。
 *    絵は水だけの背景になる。fx/minamoLive.ts と同じ絵）
 * 3. ぽんっ（2.15 秒〜）：カードが沈んで消え、入れ替わりにちびミナモが泡をはじいて跳び出す
 * 4. 話す（2.85 秒〜）：下の吹き出しで、あいさつ → ネットのあるあるがカードになったゲーム（カードが扇に並び、
 *    話題の言葉が浮かぶ）→ ★5 のキラカードを指でなぞって傾ける。「対戦へ」で、ちびミナモが左下の丸い枠の位置へ縮んで消える
 *    （11月1日。オーナー：「文字数減らすのと、属性、このカードのコンセプトを説明したい。可愛く面白く、
 *    カードの魅力を存分いいなと思ってもらいたい」。2〜3 の場面と文は Claude の案）
 */
export function MinamoIntro({
  playerName,
  onBattle,
  onSkip,
}: {
  playerName: string;
  /** 「対戦へ」を押したとき（盤面を出し始める） */
  onBattle: () => void;
  onSkip: () => void;
}) {
  const card = CATALOG[MINAMO];
  const [phase, setPhase] = useState<Phase>("card");
  const [line, setLine] = useState(0);
  const [tilted, setTilted] = useState(false);
  const [waited, setWaited] = useState(false);
  const all = lines(playerName);
  const base = all[Math.min(line, all.length - 1)] as Line;
  const cur = base.scene === "kira" && tilted ? KIRA_DONE : base;
  const moved = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const quick = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const k = quick ? 0.4 : 1;
    const ts = [
      setTimeout(() => setPhase("retract"), T_RETRACT * k),
      setTimeout(() => setPhase("pop"), T_POP * k),
      setTimeout(() => setPhase("talk"), T_TALK * k),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  // キラカードの場面：しばらくなぞらなくても、先へ進めるようにする
  useEffect(() => {
    if (base.scene !== "kira") return;
    const t = setTimeout(() => setWaited(true), T_KIRA_WAIT);
    return () => clearTimeout(t);
  }, [base.scene]);

  const next = () => {
    if (base.scene === "kira") {
      setPhase("leave");
      onBattle();
      return;
    }
    setLine((n) => n + 1);
  };

  /** キラカードを指でなぞった長さを数え、決めた長さを超えたら「なぞった」 */
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    const p = { x: e.clientX, y: e.clientY };
    if (last.current) moved.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
    if (moved.current > TILT_PX) setTilted(true);
  };

  /** その場面まで来たか */
  const at = (p: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(p);
  const face: Face = at("talk") ? cur.face : "open";
  const scene = at("talk") ? cur.scene : "hello";
  const canGo = cur.scene !== "kira" || tilted || waited;
  return (
    <div
      className={`tut-intro tut-ui ph-${phase} sc-${scene}${tilted ? " is-tilted" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="チュートリアル"
    >
      <span className="ti-rays" aria-hidden="true" />
      <span className="ti-bubbles" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 飾りの泡。並びの位置そのものが目印
          <i key={i} style={{ "--i": i, "--s": `${10 + ((i * 7) % 5) * 5}px` } as CSSProperties} />
        ))}
      </span>
      {card && (
        <div className="ti-card-wrap" aria-hidden="true">
          <div className="ti-card">
            <span className="ti-art" style={{ backgroundImage: `url(${card.art})` }} />
            <span className="ti-bg" style={{ backgroundImage: `url(${MINAMO_LIVE[MINAMO]?.bg})` }} />
            <span className="ti-subj" style={{ backgroundImage: `url(${card.subject})` }} />
            <span className="ti-splash">
              {Array.from({ length: 7 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 飾りのしぶき
                <i key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
            <span className="ti-name">
              <small>{MINAMO_EPITHET}</small>
              <b>{card.name}</b>
            </span>
          </div>
        </div>
      )}
      {scene === "trends" && <TrendFan />}
      {scene === "kira" && card && (
        <div className="ti-kira" onPointerMove={onMove} onPointerLeave={() => (last.current = null)}>
          <span className="ti-kira-glow" aria-hidden="true" />
          <HoloCard card={card} interactive />
          {!tilted && (
            <span className="ti-swipe" aria-hidden="true">
              <i />
            </span>
          )}
          {tilted && (
            <span className="ti-sparkle" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 飾りの光
                <i key={i} style={{ "--a": `${i * 45 + 20}deg` } as CSSProperties} />
              ))}
            </span>
          )}
        </div>
      )}
      <div className="ti-chibi" aria-hidden="true">
        <span className="ti-burst">
          {Array.from({ length: 10 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 飾りの泡
            <i key={i} style={{ "--a": `${i * 36}deg` } as CSSProperties} />
          ))}
        </span>
        <img key={face} src={faceUrl(face)} alt="" draggable={false} />
      </div>
      {at("talk") && (
        <div className="ti-talk g3" aria-live="polite">
          <b className="tut-who">ミナモ</b>
          <p key={cur.text}>
            <Rich text={cur.text} />
          </p>
          <div className="tut-acts">
            {canGo && (
              <button
                type="button"
                className={cur.go ? "btn" : "btn small"}
                onClick={next}
                disabled={phase === "leave"}
              >
                {cur.go ?? "つぎへ"}
              </button>
            )}
          </div>
        </div>
      )}
      {phase !== "leave" && (
        <button type="button" className="tut-skip btn ghost small" onClick={onSkip}>
          スキップ
        </button>
      )}
    </div>
  );
}

/**
 * ネットのあるあるがカードに：5 枚のカード（文字なしの絵）が扇に並び、まわりにカードの名前が「#」付きの
 * 話題の言葉として浮かぶ（TRENDS＝いまの話題、から。Claude の案）
 */
function TrendFan() {
  const cards = FAN.map((id) => CATALOG[id]).filter((c) => !!c);
  return (
    <div className="ti-fan" aria-hidden="true">
      {cards.map((c, i) => (
        <div key={c.id} className="ti-fan-card" style={{ "--i": i, "--k": i - 2 } as CSSProperties}>
          <HoloCard card={c} textHidden />
        </div>
      ))}
      {cards.map((c, i) => (
        <span
          key={c.id}
          className="ti-tag"
          style={{ "--i": i, left: `${TAG_AT[i]?.[0]}%`, top: `${TAG_AT[i]?.[1]}%` } as CSSProperties}
        >
          #{c.name}
        </span>
      ))}
    </div>
  );
}
