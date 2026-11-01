import type { Collection } from "@trends/game-core";
import { create } from "zustand";
import { api } from "../online/session";

/** 持っているカード（ID ごとの枚数）。カード一覧の灰色・枚数と、デッキを組む画面で同じものを見る */
interface CollectionStore {
  /** まだ取れていなければ null（そのあいだは、灰色の印を出さない） */
  cards: Collection | null;
  load: (token: string | null) => Promise<void>;
}

export const useCollection = create<CollectionStore>((set) => ({
  cards: null,
  load: async (token) => {
    if (!token) return;
    try {
      const r = await api<{ cards: Record<string, number> }>("/me/cards", {}, token);
      set({ cards: r.cards });
    } catch {
      // 電波が無い・サーバーが起き上がり中のときは、前の値のまま
    }
  },
}));
