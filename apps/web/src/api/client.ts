import { CARDS, type CardDef } from "@trends/cards";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
