import { CARDS, type CardDef } from "@trends/cards";

/**
 * API の場所。本番は画面と同じサーバー（空文字＝同じ場所）、開発中は localhost:3001。
 * VITE_API_URL を入れればそちらを使う。
 */
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:3001");

export interface CardsResult {
  cards: CardDef[];
  /** API に繋がらず、アプリに同梱したデータを使ったとき true */
  fallback: boolean;
}

/** API からカード一覧を取る。繋がらなければ同梱データで表示を続ける */
export async function fetchCards(): Promise<CardsResult> {
  try {
    const res = await fetch(`${API_URL}/cards`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { cards: (await res.json()) as CardDef[], fallback: false };
  } catch {
    return { cards: [...CARDS], fallback: true };
  }
}
