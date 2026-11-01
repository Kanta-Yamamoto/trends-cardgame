import type { Collection } from "@trends/game-core";
import { create } from "zustand";
import { api } from "../online/session";

/** 持っているカード（ID ごとの枚数）。カード一覧の灰色・枚数と、デッキを組む画面で同じものを見る */
interface CollectionStore {
  /** まだ取れていなければ null（そのあいだは、灰色の印を出さない） */
  cards: Collection | null;
  /** 取りに行って結果が出た（取れなかったときも true。いつまでも読み込み中のままにしない） */
  checked: boolean;
  load: (token: string | null) => Promise<void>;
}

export const useCollection = create<CollectionStore>((set) => ({
  cards: null,
  checked: false,
  load: async (token) => {
    if (!token) {
      set({ checked: true });
      return;
    }
    try {
      const r = await api<{ cards: Record<string, number> }>("/me/cards", {}, token);
      set({ cards: r.cards, checked: true });
    } catch {
      // 電波が無い・サーバーが起き上がり中のときは、前の値のまま
      set({ checked: true });
    }
  },
}));
