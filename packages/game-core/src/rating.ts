/**
 * レーティング（イロレーティング）。1500 から始まり、勝つと上がり負けると下がる。
 * 上下する幅は、相手との差で決まる（格上に勝つほど大きく上がり、格下に負けるほど大きく下がる）。
 *   勝つ見込み E = 1 / (1 + 10^((相手 − 自分) / 400))
 *   新しい値 = 今の値 + K × (結果 − E)   結果は勝ち 1・負け 0、K = 32
 * 2 人の増減は同じ幅（勝った人が上がった分だけ、負けた人が下がる）。勝てば必ず 1 以上は上がる
 */
export const RATING = { start: 1500, k: 32 } as const;

/** a が b に勝つ見込み（0〜1） */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** 勝った人・負けた人の新しいレーティング */
export function rateGame(winner: number, loser: number): { winner: number; loser: number; delta: number } {
  const delta = Math.max(1, Math.round(RATING.k * (1 - expectedScore(winner, loser))));
  return { winner: winner + delta, loser: loser - delta, delta };
}
