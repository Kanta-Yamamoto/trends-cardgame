import { useEffect, useState } from "react";
import { useAccess } from "../gacha/access";
import { Guide, preloadFaces } from "./Guide";
import { useTutorial } from "./progress";
import "../styles/tutorial.css";

/** ガチャの画面で押してもらうボタン */
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
      text="おかえり！ カードは、ガチャでカードパックを開けると集まるよ。『ガチャを回す』を押してね。"
      targets={[".hm-tile.gacha"]}
      onSkip={() => setStage("done")}
    />
  );
}

/**
 * ガチャの画面：パックの中身を見せてから、1 パック開けてもらって、チュートリアルを終える。
 * チュートリアルの 1 パックは本物で、出たカードは残る。もう一度見ている人は、開けるパックが無ければ説明だけで終える
 */
export function GachaTour() {
  const stage = useTutorial((s) => s.stage);
  const setStage = useTutorial((s) => s.setStage);
  const [step, setStep] = useState(0);
  const packs = useAccess((s) => s.access?.packs ?? 0);
  if (stage !== "gacha") return null;
  const end = () => setStage("done");
  if (step === 0) {
    return (
      <Guide
        face="open"
        text="ここがガチャ。カードパックは 1 パック 5 枚入りで、★5 のカードも出るよ。"
        shows={[".gx-pick"]}
        next={{ label: "つぎへ", onClick: () => setStep(1) }}
        onSkip={end}
      />
    );
  }
  if (packs === 0) {
    return (
      <Guide
        face="cheer"
        text="案内はこれでおしまい。いっぱい遊んでね！"
        next={{ label: "おわる", onClick: end }}
        onSkip={end}
      />
    );
  }
  return (
    <Guide
      face="cheer"
      text="1 パックプレゼント！ 『1パック開ける』を押して、開けてみて！ 案内はこれでおしまい。いっぱい遊んでね！"
      targets={[GACHA_PACK]}
      onTarget={end}
      onSkip={end}
    />
  );
}
