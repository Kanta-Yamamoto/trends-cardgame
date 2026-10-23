import { CARDS, type CardDef } from "@trends/cards";

/**
 * API の場所。本番は画面と同じサーバー（空文字＝同じ場所）、開発中は localhost:3001。
 * VITE_API_URL を入れればそちらを使う。
 */
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:3001");

/** アプリに同梱したカードデータ（API と同じ cards.json から作る。サーバーの返事を待つ間はこれを出す） */
export const BUNDLED_CARDS: CardDef[] = [...CARDS];

/**
 * API からカード一覧を取る。失敗したら投げる（画面は同梱データを出したまま、裏でやり直す）。
 * サーバーは使われていないと 0 台まで減り、起き上がり（DB の起動も含む）に数秒〜十数秒かかるので、待ち時間は長めにとる
 */
export async function fetchCards(): Promise<CardDef[]> {
  const res = await fetch(`${API_URL}/cards`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards = (await res.json()) as CardDef[];
  // DB にまだカードが入っていないときも、同梱データで表示を続ける
  return cards.length > 0 ? cards : BUNDLED_CARDS;
}
