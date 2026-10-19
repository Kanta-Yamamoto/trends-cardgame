import { opponent } from "./engine";
import type { Action, GameEvent, GameState, PlayerId } from "./types";

/** 見えないカードの代わりに入れる ID */
export const HIDDEN_CARD = "?";

/**
 * オンライン対戦で、各プレイヤーに渡す形に変える。
 * - 見る人をいつも p1 にそろえる（画面は「自分＝p1」で作られているため）
 * - 相手の手札・両者の山札の中身・乱数の種は隠す（枚数だけ分かる）
 */

const swapId = (p: PlayerId): PlayerId => opponent(p);

/** オブジェクトの中の player / active / winner を入れ替える（p2 の人が見るとき） */
function swapIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(swapIds) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if ((k === "player" || k === "active" || k === "winner") && (v === "p1" || v === "p2"))
      out[k] = swapId(v);
    else out[k] = swapIds(v);
  }
  return out as T;
}

/** 差し出し待ち（フィクサー）を、見る人の向きにする */
function pendingFor(pending: GameState["pending"], viewer: PlayerId): GameState["pending"] {
  if (!pending || viewer === "p1") return pending ?? null;
  const picks: Partial<Record<PlayerId, number>> = {};
  for (const [pid, slot] of Object.entries(pending.picks) as [PlayerId, number][]) picks[swapId(pid)] = slot;
  return { ...pending, source: swapId(pending.source), waiting: pending.waiting.map(swapId), picks };
}

/** 見る人から見た対戦の状態（相手の手札・山札・乱数の種は隠す） */
export function stateFor(state: GameState, viewer: PlayerId): GameState {
  const foe = opponent(viewer);
  const hide = (cards: string[]) => cards.map(() => HIDDEN_CARD);
  const mine = state.players[viewer];
  const theirs = state.players[foe];
  return {
    ...state,
    seed: 0,
    active: viewer === "p1" ? state.active : swapId(state.active),
    winner: state.winner && (viewer === "p1" ? state.winner : swapId(state.winner)),
    pending: pendingFor(state.pending, viewer),
    players: {
      p1: { ...mine, deck: hide(mine.deck) },
      p2: { ...theirs, deck: hide(theirs.deck), hand: hide(theirs.hand) },
    },
  };
}

/** 見る人から見た出来事（相手が引いたカードは隠す） */
export function eventsFor(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    const hidden = e.type === "drew" && e.player !== viewer ? { ...e, cardId: HIDDEN_CARD } : e;
    if (viewer === "p1") return hidden;
    const swapped = swapIds(hidden);
    // 差し出しを待つ人の一覧も入れ替える
    return swapped.type === "sacrificeAsk" ? { ...swapped, waiting: swapped.waiting.map(swapId) } : swapped;
  });
}

/** 操作を、見る人の向きに変える（相手の操作を自分の画面で再生するとき） */
export function actionFor(action: Action, viewer: PlayerId): Action {
  return viewer === "p1" ? action : swapIds(action);
}

/** 見る人の向きで送られてきた操作を、本当のプレイヤーの操作に戻す */
export function actionFrom(action: Action, sender: PlayerId): Action {
  return { ...action, player: sender } as Action;
}
