import type { ClockView, PlayerId } from "@trends/game-core";
import { useEffect, useState } from "react";
import { create } from "zustand";

/** 決着でのレーティングの動き（ランダムマッチだけ） */
export interface RatingChange {
  before: number;
  after: number;
}

/**
 * オンライン対戦の、盤面の外の情報（持ち時間・レーティングの動き）。
 * 時計は届いたらすぐ反映する（盤面は演出のあとで進むが、時間はそのあいだも進んでいるため）
 */
interface Live {
  clock: ClockView | null;
  /** 時計が届いた時刻（Date.now()） */
  at: number;
  rating: RatingChange | null;
  setClock: (c: ClockView | null) => void;
  setRating: (r: RatingChange | null) => void;
  reset: () => void;
}

export const useLive = create<Live>((set) => ({
  clock: null,
  at: 0,
  rating: null,
  setClock: (clock) => set({ clock, at: Date.now() }),
  setRating: (rating) => set({ rating }),
  reset: () => set({ clock: null, at: 0, rating: null }),
}));

/** 今の残り時間（その人のターンの時間と持ち時間）。時計が動いているあいだは、画面が自分で減らしていく */
export interface ClockLeft {
  /** この人の時計が動いている */
  running: boolean;
  /** ターンの時間の残り（ms。この人の時計が動いているときだけ意味がある） */
  turn: number;
  /** 持ち時間の残り（ms） */
  bank: number;
  /** 相手の手番の途中で差し出しを選ぶ番なら、選ぶ残り（ms） */
  pick: number | null;
}

/** active は手番の人（差し出しを選ぶのは、手番でない人） */
export function leftAt(c: ClockView, at: number, now: number, who: PlayerId, active: PlayerId): ClockLeft {
  const running = c.running === who;
  const passed = running ? Math.max(0, now - at - c.holdMs) : 0;
  const over = Math.max(0, passed - c.turnLeft);
  return {
    running,
    turn: running ? Math.max(0, c.turnLeft - passed) : 0,
    bank: Math.max(0, c.bank[who] - over),
    pick: c.pickLeft !== null && who !== active ? Math.max(0, c.pickLeft - (now - at)) : null,
  };
}

/** 時計を 0.25 秒ごとに読み直す（オンライン対戦で時計があるときだけ） */
export function useClockLeft(who: PlayerId, active: PlayerId): ClockLeft | null {
  const { clock, at } = useLive();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!clock?.running && clock?.pickLeft == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [clock]);
  return clock ? leftAt(clock, at, Math.max(now, at), who, active) : null;
}

/** 秒の表示（1:05・0:24） */
export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
