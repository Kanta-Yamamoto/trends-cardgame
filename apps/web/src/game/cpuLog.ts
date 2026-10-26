import {
  type Action,
  type CpuGameRecord,
  type CpuThought,
  cardSnapshot,
  cardsStamp,
  type GameState,
  moveCards,
  type PlayerId,
} from "@trends/game-core";
import { API_URL } from "../api/client";
import { useSession } from "../online/session";

/**
 * CPU 対戦の記録を取って、終わったらサーバーに送る（docs/cpu-logs.md）。
 * 人と CPU の対戦を一手ずつ・CPU が考えた中身つきで残し、あとで見返して CPU を強くする（最終の目的はカードのバランス調整）。
 * 決着したとき・途中でやめたとき（戻る・新しい対戦・画面を閉じる）に1回だけ送る。送れなくても対戦には響かない
 */

let rec: CpuGameRecord | null = null;
let sent = false;
/** テスト用：最後に送ろうとした記録 */
let last: CpuGameRecord | null = null;

const CLIENT_KEY = "trends-client";

/** 端末ごとの印（同じ人がどの端末で遊んだかを見るため。人はアカウントで見分ける） */
function clientId(): string {
  try {
    const got = localStorage.getItem(CLIENT_KEY);
    if (got) return got;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

export function beginCpuLog(o: {
  catalog: Parameters<typeof cardsStamp>[0];
  human: PlayerId;
  cpu: PlayerId;
  humanDeck: { ref: string; name: string; cards: string[] };
  cpuDeck: { ref: string; cards: string[] };
  seed: number;
  first: PlayerId;
  initial: GameState;
}) {
  abandonCpuLog();
  rec = {
    v: 1,
    cards: cardsStamp(o.catalog),
    cardData: cardSnapshot(o.catalog, [...o.humanDeck.cards, ...o.cpuDeck.cards]),
    human: o.human,
    cpu: o.cpu,
    humanDeck: { ...o.humanDeck, cards: [...o.humanDeck.cards] },
    cpuDeck: { ...o.cpuDeck, cards: [...o.cpuDeck.cards] },
    seed: o.seed,
    first: o.first,
    startedAt: Date.now(),
    initial: o.initial,
    moves: [],
    thoughts: [],
    end: { winner: null, turn: o.initial.turn, at: 0 },
  };
  sent = false;
}

/** 盤面に反映した操作を残す（使ったカードの ID も。before は手を当てる前の盤面）。決着したら送る */
export function logMove(action: Action, before: GameState, after: GameState) {
  if (!rec || sent) return;
  rec.moves.push({ action, at: Date.now() - rec.startedAt, ...moveCards(before, action) });
  if (after.winner) finish(after, false);
}

/** CPU が1ターン分を考えた中身を残す（そのあとに続く手の番号と一緒に） */
export function logThought(t: CpuThought) {
  if (!rec || sent) return;
  rec.thoughts.push({ ...t, move: rec.moves.length });
}

/** 途中でやめた（戻る・新しい対戦・オンライン対戦へ）。一手でも進んでいれば送る */
export function abandonCpuLog(state?: GameState | null, beacon = false) {
  if (!rec || sent || rec.moves.length === 0) {
    rec = null;
    return;
  }
  finish(state ?? null, beacon);
}

function finish(state: GameState | null, beacon: boolean) {
  if (!rec) return;
  rec.end = {
    winner: state?.winner ?? null,
    turn: state?.turn ?? rec.end.turn,
    at: Date.now() - rec.startedAt,
  };
  sent = true;
  last = rec;
  void send(rec, beacon);
  rec = null;
}

/** 画面を閉じたあとも届くように送れる大きさ（keepalive の上限 64KB より少し小さく） */
const KEEPALIVE_MAX = 60_000;

async function send(record: CpuGameRecord, beacon: boolean) {
  if (import.meta.env.MODE === "test") return;
  // 記録はアカウントにひも付ける（ログインしていなければ送らない。サービス全体でログインが要る）
  const token = useSession.getState().token;
  if (!token) return;
  let body = JSON.stringify({ client: clientId(), record });
  // 画面を閉じるときは、閉じたあとも届くように送る（大きすぎれば、考えた中身を外して小さくする）
  if (beacon && body.length > KEEPALIVE_MAX)
    body = JSON.stringify({ client: clientId(), record: { ...record, thoughts: [] } });
  try {
    await fetch(`${API_URL}/logs/cpu-games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body,
      keepalive: beacon && body.length <= KEEPALIVE_MAX,
    });
  } catch {
    // 送れなくても対戦には響かない
  }
}

/** 画面を閉じる・別のページへ行くときに、途中の記録を送る */
export function watchPageHide(getState: () => GameState | null) {
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", () => abandonCpuLog(getState(), true));
}

/** テスト用：最後に送ろうとした記録と、記録中のもの */
export const cpuLogForTest = () => ({ last, current: rec });
