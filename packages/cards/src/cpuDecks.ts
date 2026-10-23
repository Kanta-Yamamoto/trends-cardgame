import { DECKS, type DeckId } from "./decks";

/**
 * ランダムマッチで待機している CPU のデッキ（人と組めなかった人の相手をする。対戦ごとに 1 つを選ぶ）。
 * 10月23日のカードの大調整（コスト 1〜8 の階段）に合わせて組み直した構築済みデッキの 7 つを使う。
 * どれも先読みする CPU（planTurnSearch）どうしの総当たりで勝率 39〜59% に収めたもの（docs/rules.md「バランスの目安」v16）。
 * 同じ CPU が使うので、新しく組むより強さが確か。構築済みデッキを組み直したら、CPU もそのまま新しいほうを使う
 */
export const CPU_DECKS: readonly DeckId[] = Object.keys(DECKS) as DeckId[];
