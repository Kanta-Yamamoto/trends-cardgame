import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { warmFx } from "../fx/warm";
import { ME, useGame } from "../game/store";
import { useSession } from "../online/session";
import { Board } from "../pages/Play";
import { AttrTour } from "./AttrTour";
import { BATTLE_STEPS, type Ctx } from "./battleSteps";
import { faceUrl, Guide, preloadFaces } from "./Guide";
import { MinamoIntro, T_LEAVE } from "./MinamoIntro";
import { useTutorial } from "./progress";
import { Rich } from "./Rich";
import "../styles/tutorial.css";

/** 画面にその要素があるか（盤面の中の小窓・演出の出入りを、少しずつ見て知る） */
function useDomFlag(selector: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOn(!!document.querySelector(selector)), 120);
    return () => clearInterval(t);
  }, [selector]);
  return on;
}

/** 演出（ターンの始まりの帯・闇堕ち・呪文のカード）を見せている間 */
const FX_ON = ".turn-banner, .dark-cut, .foe-reveal";
/** 演出の間も押せるもの（闇堕ちの演出は押すと飛ばせる） */
const SKIPPABLE = ".dark-cut";
/** いつでも押せるもの：光らせたカードを長押しして開いた拡大表示と、用語の説明（閉じられるように） */
const ALWAYS = [".card-zoom", ".help-sheet"];

/**
 * チュートリアル（10月27日。オーナー：「初回ログイン時に、最初にカードのなかのvtuberミナモを写して…ちびキャラみなもが出てきて、
 * チュートリアルを説明してくれる」「cpu対戦か特別に作った何かに誘導して基本のキャラ出し、呪文出し、闇堕ち、プレイヤー殴りで
 * 残り5体力とかを削って勝ち、のあと戻ってきてガチャに誘導しておわり」）。
 * 導入（MinamoIntro。あいさつ・あるあるがカードに・キラカード）→ チュートリアルの対戦（本物の盤面。案内は Guide）
 * → 勝ったら属性の紹介（AttrTour）→ ホームへ戻り、ガチャへ案内する（TourGuides.tsx）
 */
export function Tutorial() {
  const user = useSession((s) => s.user);
  const setStage = useTutorial((s) => s.setStage);
  const startTutorial = useGame((s) => s.startTutorial);
  const inGame = useGame((s) => s.mode === "tutorial" && !!s.game);
  const navigate = useNavigate();
  const [battle, setBattle] = useState(false);
  const [intro, setIntro] = useState(true);
  const [attrs, setAttrs] = useState(false);

  useEffect(() => {
    preloadFaces();
    // 導入を見せている間に、盤面の演出の舞台を用意しておく
    const unwarm = warmFx(1200);
    return () => {
      unwarm?.();
      // 途中で抜けたら、チュートリアルの対戦を片付ける（CPU と対戦の画面に残さない）
      if (useGame.getState().mode === "tutorial") useGame.getState().quit();
    };
  }, []);

  const skip = () => {
    setStage("done");
    navigate("/");
  };
  const toBattle = () => {
    startTutorial();
    setBattle(true);
    setTimeout(() => setIntro(false), T_LEAVE);
  };
  const finish = () => {
    setStage("gacha");
    navigate("/");
  };

  return (
    <section className="page play tut-page">
      {battle && inGame && (
        <Board result={({ broke }) => <TutorialWin broke={broke} onNext={() => setAttrs(true)} />} />
      )}
      {attrs && <AttrTour onNext={finish} onSkip={skip} />}
      {battle && inGame && !intro && <BattleGuide onSkip={skip} />}
      {intro && <MinamoIntro playerName={user?.name ?? ""} onBattle={toBattle} onSkip={skip} />}
    </section>
  );
}

/** 対戦の案内：BATTLE_STEPS を順に。演出の間は隠し、決めた形になったら次へ */
function BattleGuide({ onSkip }: { onSkip: () => void }) {
  const game = useGame((s) => s.game);
  const selection = useGame((s) => s.selection);
  const storeBusy = useGame((s) => s.animating || s.cpuBusy);
  const omenOpen = useDomFlag(".dark-confirm");
  const fxOn = useDomFlag(FX_ON);
  // 拡大表示・用語の説明を開いている間は、案内を消す（閉じたら戻す）
  const zoomed = useDomFlag(ALWAYS.join(", "));
  const [i, setI] = useState(0);
  const busy = storeBusy || fxOn;
  const ctx: Ctx | null = game
    ? {
        game,
        hand: selection?.kind === "hand" ? (game.players[ME].hand[selection.index] ?? null) : null,
        attacker: selection?.kind === "attacker" ? selection.slot : null,
        omenOpen,
      }
    : null;
  const step = BATTLE_STEPS[i];
  const done = !!ctx && !busy && !!step?.done?.(ctx);
  useEffect(() => {
    if (done) setI((n) => n + 1);
  }, [done]);

  // 決着したら案内を消す（結果の画面が出るまでは、何も押せないまま）
  if (!ctx || !step || ctx.game.winner)
    return <Guide face="cheer" text="" hidden allow={[SKIPPABLE, ...ALWAYS]} />;
  const v = step.view(ctx);
  return (
    <Guide
      face={v.face}
      text={v.text}
      targets={busy ? [] : v.targets}
      shows={v.shows}
      allow={[...(busy ? [SKIPPABLE] : (v.allow ?? [])), ...ALWAYS]}
      hidden={busy || done || zoomed}
      dock=".phand"
      next={step.next ? { label: step.next, onClick: () => setI((n) => n + 1) } : undefined}
      onSkip={onSkip}
    />
  );
}

/** 勝ったあと：ちびミナモが喜んで、ガチャの案内へ（ふつうの結果の画面の代わり） */
function TutorialWin({ broke, onNext }: { broke: boolean; onNext: () => void }) {
  return (
    <div
      className={`result win tut-win tut-ui${broke ? " after-break" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="チュートリアルの結果"
    >
      <section className="result-body">
        <strong className="result-title">勝利！</strong>
        <span className="tw-chibi" aria-hidden="true">
          <img src={faceUrl("cheer")} alt="" draggable={false} />
        </span>
        <div className="tw-talk g3">
          <b className="tut-who">ミナモ</b>
          <p>
            <Rich text="やったね！ これで**基本はばっちり**。つぎは、カードの**属性**を見てみよう！" />
          </p>
        </div>
      </section>
      <div className="result-actions">
        <button type="button" className="btn lg" onClick={onNext}>
          つぎへ
        </button>
      </div>
    </div>
  );
}
