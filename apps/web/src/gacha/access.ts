import { create } from "zustand";
import { api } from "../online/session";

/** このユーザーに今できること（/me/access）。買い切りを買ったか・今開けられるパックの数 */
export interface Access {
  unlocked: boolean;
  /** 持っていないカードもデッキに入れられる（Web の友だち） */
  allCards: boolean;
  packs: number;
}

interface AccessStore {
  access: Access | null;
  /** サーバーから取り直す（取れなければ前の値のまま） */
  load: (token: string | null) => Promise<void>;
  set: (a: Access) => void;
}

export const useAccess = create<AccessStore>((set) => ({
  access: null,
  load: async (token) => {
    if (!token) return;
    try {
      set({ access: await api<Access>("/me/access", {}, token) });
    } catch {
      // 電波が無い・サーバーが起き上がり中のときは、前の値のまま
    }
  },
  set: (access) => set({ access }),
}));
