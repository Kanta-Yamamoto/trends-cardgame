import { CARDS } from "@trends/cards";
import type { GameEvent, PlayerId } from "@trends/game-core";

/** 結果画面に出す、決着の原因（見出しと、何が起きたかの1行） */
export interface EndReason {
  title: string;
  detail: string;
}

/**
 * 対戦の記録から、決着の原因を作る（me は見ている人。勝ち負けは won）。
 * 決着の出来事（降参・時間切れ・山札切れ・特殊勝利）がなければ、ライフが0になっての決着
 */
export function endReason(events: GameEvent[], me: PlayerId, won: boolean): EndReason {
  const end = [...events]
    .reverse()
    .find(
      (e) =>
        e.type === "resigned" || e.type === "timedOut" || e.type === "deckOut" || e.type === "specialWin",
    );
  switch (end?.type) {
    case "resigned":
      return won
        ? { title: "相手の降参", detail: "相手が降参した" }
        : { title: "降参", detail: "あなたが降参した" };
    case "timedOut":
      return won
        ? { title: "相手の時間切れ", detail: "相手の持ち時間が0になった" }
        : { title: "時間切れ", detail: "あなたの持ち時間が0になった" };
    case "deckOut":
      return end.player === me
        ? { title: "山札切れ", detail: "自分のターンの始めに、あなたの山札が0枚でカードを引けなかった" }
        : { title: "相手の山札切れ", detail: "相手のターンの始めに、相手の山札が0枚でカードを引けなかった" };
    case "specialWin": {
      const card = CARDS.find((c) => c.id === end.cardId);
      const name = card?.dark?.name ?? card?.name ?? end.cardId;
      return end.player === me
        ? { title: `『${name}』の特殊勝利`, detail: "自分のターンの始めに、あなたの山札が0枚だった" }
        : { title: `相手の『${name}』の特殊勝利`, detail: "相手のターンの始めに、相手の山札が0枚だった" };
    }
    default:
      return won
        ? { title: "相手のライフが0", detail: "相手のライフを0にした" }
        : { title: "ライフが0", detail: "あなたのライフが0になった" };
  }
}
