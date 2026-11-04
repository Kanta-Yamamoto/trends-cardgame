import type { Face } from "../tutorial/Guide";

/** 結果の画面で、ちびミナモが言う一言と、そのときの表情 */
export interface ResultTalk {
  text: string;
  face: Face;
}

/** 長期戦とみなすターン数（両方のターンを数える。お互い 8 ターンずつ） */
export const LONG_GAME_TURN = 16;
/** 「激しいバトル」「惜しかった」とみなす、残りのライフの上限 */
export const CLOSE_LP = 10;

/**
 * 結果の画面のちびミナモの一言（11月4日。オーナーの決めた形）。
 * 長期戦がいちばん先。それ以外は、勝ちは自分の残りのライフ、負けは相手の残りのライフで分ける。
 * turn は決着したターン（両方のターンを数える）
 */
export function resultTalk(won: boolean, turn: number, myLp: number, foeLp: number): ResultTalk {
  const long = turn >= LONG_GAME_TURN;
  if (won) {
    if (long) return { text: "考えて戦い抜いたね！長期戦を制したよ！", face: "think" };
    if (myLp <= CLOSE_LP) return { text: "激しいバトルを制したね！", face: "surprise" };
    return { text: "おめでとう！圧倒的だったね！", face: "cheer" };
  }
  if (long) return { text: "長期戦に勝てるカードに変更してみよう！", face: "point" };
  if (foeLp <= CLOSE_LP) return { text: "惜しかったね、、、次のバトルに活かそう！", face: "shy" };
  return { text: "相手が一枚上手だったね。デッキを見直してみよう！", face: "think" };
}
