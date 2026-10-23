import { describe, expect, it } from "vitest";
import { MatchQueue, pairUp, type Seeker } from "../src/matches/matchmaking";
import { rankEntries } from "../src/ranking/ranking.service";

const T = 1_000_000;
const seeker = (userId: string, rating: number, waited = 0): Seeker => ({
  userId,
  socketId: `s-${userId}`,
  deck: "solo_flame",
  rating,
  since: T - waited * 1000,
});

describe("ランダムマッチの組み方", () => {
  it("レーティングの近い人どうしを組む", () => {
    const pairs = pairUp([seeker("a", 1500), seeker("b", 1900), seeker("c", 1520), seeker("d", 1880)], T);
    expect(pairs.map(([x, y]) => [x.userId, y.userId].sort().join(""))).toEqual(["ac", "bd"]);
  });

  it("差が大きいとすぐには組まないが、待つほど組める幅が広がる", () => {
    const q = [seeker("a", 1500), seeker("b", 2000)];
    expect(pairUp(q, T)).toHaveLength(0);
    // 長く待った人に合わせて広げる（200 + 20 × 15 秒 = 500）
    expect(pairUp([seeker("a", 1500, 15), seeker("b", 2000)], T)).toHaveLength(1);
  });

  it("同じ人どうしは組まない。同じ人が並び直したら新しいほうだけ残る", () => {
    const q = new MatchQueue();
    q.add(seeker("a", 1500));
    q.add({ ...seeker("a", 1500), socketId: "other" });
    expect(q.size).toBe(1);
    expect(q.take(T)).toHaveLength(0);
    q.add(seeker("b", 1510));
    const [pair] = q.take(T);
    expect(pair?.map((s) => s.socketId).sort()).toEqual(["other", "s-b"]);
    expect(q.size).toBe(0);
  });

  it("接続が切れたら行列から外す", () => {
    const q = new MatchQueue();
    q.add(seeker("a", 1500));
    q.removeSocket("s-a");
    expect(q.size).toBe(0);
  });
});

describe("ランキングの並べ方", () => {
  it("高い順。同じ値は同じ順位で、次はその人数だけ飛ぶ", () => {
    const row = (id: string, rating: number, games = 1) => ({ id, name: id, rating, games, wins: 0 });
    const ranked = rankEntries([row("a", 1500), row("b", 1600), row("c", 1600, 3), row("d", 1400)]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["c", 1],
      ["b", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });
});
