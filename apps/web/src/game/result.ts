import { CARDS } from "@trends/cards";
import type { GameEvent, PlayerId } from "@trends/game-core";

/** 結果画面に出す、決着の原因（1 行）と決め手のカード */
export interface EndReason {
  /** 何が起きて決着したかの 1 行（見出しと説明を分けない。11月3日。オーナー：説明が重複している） */
  line: string;
  /** 決め手のカード（最後にダメージを与えたカード・特殊勝利のカード）。降参・時間切れ・山札切れでは無い */
  finisher?: { cardId: string; mine: boolean };
}

const opp = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

/** 呪文・場に出たときの効果のダメージは、そのすぐ前の出来事のカードが出した */
const SOURCE = new Set<GameEvent["type"]>([
  "cast",
  "played",
  "summoned",
  "deathTriggered",
  "delayedDamageFired",
]);

/** 負けた側のライフを 0 にしたカード（記録から分からなければ undefined） */
function lastHit(events: GameEvent[], loser: PlayerId): string | undefined {
  let i = events.length - 1;
  for (; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "leaderDamaged" && e.player === loser && e.lp <= 0) break;
  }
  if (i < 0) return undefined;
  const hit = events[i];
  if (hit?.type === "leaderDamaged" && hit.by) return hit.by;
  for (let j = i - 1; j >= 0; j--) {
    const e = events[j];
    if (!e || e.type === "turnStarted") return undefined;
    if (SOURCE.has(e.type) && "cardId" in e) return e.cardId;
  }
  return undefined;
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
      return { line: won ? "相手が降参した" : "降参した" };
    case "timedOut":
      return { line: won ? "相手の持ち時間が切れた" : "持ち時間が切れた" };
    case "deckOut":
      return {
        line:
          end.player === me ? "山札が0枚で、カードを引けなかった" : "相手の山札が0枚で、カードを引けなかった",
      };
    case "specialWin": {
      const card = CARDS.find((c) => c.id === end.cardId);
      const name = card?.dark?.name ?? card?.name ?? end.cardId;
      const mine = end.player === me;
      return {
        line: mine ? `『${name}』の特殊勝利` : `相手の『${name}』の特殊勝利`,
        finisher: { cardId: end.cardId, mine },
      };
    }
    default: {
      const loser = won ? opp(me) : me;
      const by = lastHit(events, loser);
      return {
        line: won ? "相手のライフを0にした" : "ライフが0になった",
        finisher: by ? { cardId: by, mine: won } : undefined,
      };
    }
  }
}
