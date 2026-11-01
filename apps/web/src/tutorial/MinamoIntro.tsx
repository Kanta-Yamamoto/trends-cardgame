import { MINAMO_EPITHET } from "@trends/cards";
import { type CSSProperties, useEffect, useState } from "react";
import { MINAMO_LIVE } from "../fx/minamoLive";
import { CATALOG } from "../game/store";
import { usePageMusic } from "../sound/music";
import { type Face, faceUrl } from "./Guide";

/** 導入で映すカード（ミナモ） */
const MINAMO = "c3";

/** 導入の時間（ms）。カードを映す → ミナモが引っ込む → カードが下がり、ちびミナモがぽんっと出る → 話しはじめる */
const T_RETRACT = 1500;
const T_POP = 2150;
const T_TALK = 2850;
/** 「対戦へ」を押してから、ちびミナモが左下の丸い枠へ縮んで消えるまで */
export const T_LEAVE = 650;

interface Line {
  face: Face;
  text: string;
  /** 最後の行のボタンの文字（ほかは「つぎへ」） */
  go?: string;
}

const lines = (name: string): Line[] => [
  {
    face: "shy",
    text: `はじめまして、${name}さん！ わたしはミナモ。ここからは、ちっちゃいわたしが遊び方を案内するね。`,
  },
  {
    face: "open",
    text: "TRENDS は、キャラクターと呪文のカードで戦うカードゲーム。相手のプレイヤーのライフを 0 にしたら勝ちだよ。",
  },
  { face: "point", text: "さっそく、ためしに対戦してみよう！", go: "対戦へ" },
];

const PHASES = ["card", "retract", "pop", "talk", "leave"] as const;
type Phase = (typeof PHASES)[number];

/**
 * チュートリアルの導入（10月27日。オーナー：「最初にカードのなかのvtuberミナモを写して、そのあとに引っ込めて、
 * 切り抜いたこのちびキャラみなもが出てきて、チュートリアルを説明してくれる」）。
 * 1. カード（0〜1.5 秒）：明るい地に、ミナモのカードがふわっと上がってくる。名前の札（二つ名つき）がポンと出る
 * 2. 引っ込む（1.5 秒〜）：カードの中のミナモが、ひょこっと上の縁の外へ引っ込む（召喚の演出の引っ込み方と同じ。
 *    絵は水だけの背景になる。fx/minamoLive.ts と同じ絵）
 * 3. ぽんっ（2.15 秒〜）：カードが沈んで消え、入れ替わりにちびミナモが泡をはじいて跳び出す
 * 4. 話す（2.85 秒〜）：下の吹き出しで、あいさつと遊び方。「対戦へ」で、ちびミナモが左下の丸い枠の位置へ縮んで消える
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
  // 導入の間は、ホームの曲を流す（オーナー：「ホームの画面の音が鳴っていてほしい」）
  usePageMusic("home");
  const card = CATALOG[MINAMO];
  const [phase, setPhase] = useState<Phase>("card");
  const [line, setLine] = useState(0);
  const all = lines(playerName);
  const cur = all[Math.min(line, all.length - 1)] as Line;

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

  const next = () => {
    if (!cur.go) return setLine((n) => n + 1);
    setPhase("leave");
    onBattle();
  };

  /** その場面まで来たか */
  const at = (p: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(p);
  const face: Face = at("talk") ? cur.face : "open";
  return (
    <div
      className={`tut-intro tut-ui ph-${phase}`}
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
          <p key={line}>{cur.text}</p>
          <div className="tut-acts">
            <button
              type="button"
              className={cur.go ? "btn" : "btn small"}
              onClick={next}
              disabled={phase === "leave"}
            >
              {cur.go ?? "つぎへ"}
            </button>
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
