import { DECKS } from "./decks";

/**
 * ランダムマッチで待機している CPU のデッキ（人と組めなかった人の相手をする。対戦ごとに 1 つを選ぶ）。
 * デッキの決まり（20 枚・同じカードは 2 枚まで・属性 1 つ＋共通・闇堕ちを持つカードは 1 種類）を守る。
 * TODO：カードの効果の大調整が入ったら、その後のカードで組み直す（それまでは構築済みデッキを仮に使う）
 */
export interface CpuDeck {
  /** 対戦の始めに相手のデッキとして見せる名前 */
  name: string;
  cards: readonly string[];
}

export const CPU_DECKS: readonly CpuDeck[] = [
  { name: "CPU の炎上", cards: DECKS.solo_flame },
  { name: "CPU のメロい", cards: DECKS.solo_idol },
  { name: "CPU の神", cards: DECKS.solo_expert },
  { name: "CPU の草", cards: DECKS.solo_meme },
  { name: "CPU の癒し", cards: DECKS.solo_heal },
];
