import { applyAction } from "./engine";
import type { CpuThought } from "./search";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

type Catalog = Record<string, RuleCard>;

/**
 * CPU 対戦の記録。人と CPU の対戦を一手ずつ残し、あとで見返して CPU を強くする（最終の目的はカードのバランス調整。docs/cpu-logs.md）。
 * 最初の盤面（initial）に moves を順に applyAction すれば、対戦を最初から再生できる（乱数も state の中にあるので同じになる）
 */
export interface CpuGameRecord {
  /** 記録の形の版（形を変えたら上げる） */
  v: 1;
  /** カードのデータ（コスト・数値・効果）の印。カードを調整した前後の記録を見分ける */
  cards: string;
  /** 人が使う側と CPU が使う側 */
  human: PlayerId;
  cpu: PlayerId;
  /** デッキ（構築済みの ID か "custom:…"）と中身 */
  humanDeck: { ref: string; name: string; cards: string[] };
  cpuDeck: { ref: string; cards: string[] };
  seed: number;
  first: PlayerId;
  /** 始めの時刻（ミリ秒） */
  startedAt: number;
  initial: GameState;
  /** 起きた順の操作。at は始めからの経過（ミリ秒）。人が考えた時間を見るため */
  moves: { action: Action; at: number }[];
  /** CPU が考えた中身。move は、そのとき次に入る moves の番号（そこから CPU の手が続く） */
  thoughts: (CpuThought & { move: number })[];
  /** 決着。winner が無ければ途中でやめた */
  end: { winner: PlayerId | null; turn: number; at: number };
}

/** カードのデータの印（対戦に効く値だけを並べて縮めたもの） */
export function cardsStamp(catalog: Catalog): string {
  const text = JSON.stringify(
    Object.keys(catalog)
      .sort()
      .map((id) => {
        const c = catalog[id];
        if (!c) return [id];
        // 闇の姿は名前・絵を除いて、数値と効果だけ
        const dark = c.dark ? [c.dark.attack, c.dark.hp, c.dark.keywords, c.dark.effects] : null;
        return [
          id,
          c.type,
          c.cost,
          c.attack,
          c.hp,
          c.keywords,
          c.effects,
          c.target ?? null,
          c.kaiwai,
          c.attributes,
          dark,
        ];
      }),
  );
  // FNV-1a（32 ビット）
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * 記録を最初から再生する。途中の state（moves[i] の前の盤面）を順に返す。
 * 再生できなかった（カードのデータが変わったなど）ときは、そこまでの state と、止まった手の番号を返す
 */
export function replayRecord(
  rec: CpuGameRecord,
  catalog: Catalog,
): { states: GameState[]; final: GameState; failedAt: number | null } {
  const states: GameState[] = [];
  let s = rec.initial;
  for (let i = 0; i < rec.moves.length; i++) {
    states.push(s);
    const m = rec.moves[i];
    if (!m) break;
    try {
      s = applyAction(s, m.action, catalog).state;
    } catch {
      return { states, final: s, failedAt: i };
    }
  }
  return { states, final: s, failedAt: null };
}
