import { useEffect, useState } from "react";
import { Guide, preloadFaces } from "./Guide";
import { useTutorial } from "./progress";
import "../styles/tutorial.css";

/** ガチャの画面で押してもらうボタン（いまはデモの 1 パック。デモを消すときは、本物の 1 パックのボタンに付け替える） */
export const GACHA_PACK = '[data-tut="gacha-pack"]';

/**
 * チュートリアルの対戦のあと、ホームでガチャのボタンへ案内する（10月27日。オーナー：「戻ってきてガチャに誘導しておわり」）
 */
export function HomeTour() {
  const stage = useTutorial((s) => s.stage);
  const setStage = useTutorial((s) => s.setStage);
  useEffect(preloadFaces, []);
  if (stage !== "gacha") return null;
  return (
    <Guide
      face="point"
      text="おかえり！ カードは**ガチャ**で集めるよ。押してみて！"
      targets={[".hm-tile.gacha"]}
      onSkip={() => setStage("done")}
    />
  );
}

/** ガチャの画面：パックの中身を見せてから、ためしに 1 パック開けてもらって、チュートリアルを終える */
export function GachaTour() {
  const stage = useTutorial((s) => s.stage);
  const setStage = useTutorial((s) => s.setStage);
  const [step, setStep] = useState(0);
  if (stage !== "gacha") return null;
  const end = () => setStage("done");
  if (step === 0) {
    return (
      <Guide
        face="open"
        text="1 パック **5 枚**入り。**★5** が出るかも…！"
        shows={[".gx-info"]}
        next={{ label: "つぎへ", onClick: () => setStep(1) }}
        onSkip={end}
      />
    );
  }
  return (
    <Guide
      face="cheer"
      text="いまは**デモ**で引けるよ。『1パック』を開けてみて！ 案内はこれでおしまい。いっぱい遊んでね！"
      targets={[GACHA_PACK]}
      onTarget={end}
      onSkip={end}
    />
  );
}
