import { create } from "zustand";

/**
 * チュートリアルの進み具合（10月27日。オーナー：「初回ログイン時に…ちびキャラみなもが出てきて、チュートリアルを説明してくれる」）。
 * battle＝導入と対戦がまだ／gacha＝対戦を終え、ガチャへの案内がまだ／done（または無し）＝終わった。
 * 初めてプレイヤー名を決めたときに battle にする。前から遊んでいる人には出さない（ホームのメニューからいつでも見られる）。
 * 端末ごとに覚える（サーバーには持たない）。途中で閉じても、次にホームを開いたときに続きから
 */
export type TutorialStage = "battle" | "gacha" | "done";

const KEY = "trends.tutorial";

function load(): TutorialStage {
  try {
    const v = localStorage.getItem(KEY);
    return v === "battle" || v === "gacha" ? v : "done";
  } catch {
    return "done";
  }
}

interface Progress {
  stage: TutorialStage;
  setStage: (s: TutorialStage) => void;
}

export const useTutorial = create<Progress>((set) => ({
  stage: load(),
  setStage: (stage) => {
    try {
      if (stage === "done") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, stage);
    } catch {
      // 保存できなくても、このページを開いている間は進む
    }
    set({ stage });
  },
}));
