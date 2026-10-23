/**
 * ランダムマッチの待ち行列（サーバー1台のメモリに持つ。docs/online.md「今の割り切り」）。
 * レーティングの近い人どうしを組む。待つほど、組んでよい差を広げる（人が少なくても、しばらく待てば誰かと組める）
 */

/** 待っている1人 */
export interface Seeker {
  userId: string;
  /** 待っている接続（組めたらここに知らせる。切れたら行列から外す） */
  socketId: string;
  deck: string;
  rating: number;
  /** 待ち始めた時刻 */
  since: number;
}

/** これだけ待っても人と組めなければ、待機している CPU と組む（テストでは CPU_WAIT_MS で短くする） */
export const cpuWaitMs = () => Number(process.env.CPU_WAIT_MS ?? 15_000);

/** 組んでよいレーティングの差：はじめは 200、1 秒待つごとに 20 広がる（30 秒で 800） */
export function ratingWindow(s: Seeker, now: number): number {
  return 200 + 20 * Math.max(0, (now - s.since) / 1000);
}

/**
 * 待っている人を2人ずつ組む。長く待っている人から順に、組める相手のうちレーティングがいちばん近い人と組む。
 * 組めるのは、差が2人のどちらかの許す幅に入るとき（長く待った人に合わせて広げる）
 */
export function pairUp(queue: Seeker[], now: number): [Seeker, Seeker][] {
  const waiting = [...queue].sort((a, b) => a.since - b.since);
  const used = new Set<Seeker>();
  const pairs: [Seeker, Seeker][] = [];
  for (const a of waiting) {
    if (used.has(a)) continue;
    let best: Seeker | null = null;
    for (const b of waiting) {
      if (b === a || used.has(b) || b.userId === a.userId) continue;
      const gap = Math.abs(a.rating - b.rating);
      if (gap > Math.max(ratingWindow(a, now), ratingWindow(b, now))) continue;
      if (!best || gap < Math.abs(a.rating - best.rating)) best = b;
    }
    if (!best) continue;
    used.add(a);
    used.add(best);
    pairs.push([a, best]);
  }
  return pairs;
}

export class MatchQueue {
  private list: Seeker[] = [];

  /** 行列に入る（同じ人がもう待っていたら、新しいほうに入れ替える） */
  add(s: Seeker) {
    this.list = this.list.filter((x) => x.userId !== s.userId);
    this.list.push(s);
  }

  /** その接続を行列から外す */
  removeSocket(socketId: string) {
    this.list = this.list.filter((x) => x.socketId !== socketId);
  }

  /** 組めた2人を行列から外して返す */
  take(now: number): [Seeker, Seeker][] {
    const pairs = pairUp(this.list, now);
    const out = new Set(pairs.flat());
    this.list = this.list.filter((x) => !out.has(x));
    return pairs;
  }

  /** 長く待っても人と組めなかった人を行列から外して返す（CPU と組む） */
  takeLonely(now: number, waitMs = cpuWaitMs()): Seeker[] {
    const lonely = this.list.filter((x) => now - x.since >= waitMs);
    this.list = this.list.filter((x) => !lonely.includes(x));
    return lonely;
  }

  /** 組めなかったときに、待ち始めた時刻のまま戻す */
  putBack(s: Seeker) {
    if (!this.list.some((x) => x.userId === s.userId)) this.list.push(s);
  }

  get size() {
    return this.list.length;
  }
}
