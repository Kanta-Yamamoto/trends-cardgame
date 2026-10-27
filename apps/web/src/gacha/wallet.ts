import { create } from "zustand";
import { api } from "../online/session";

/** ジェムの残高（有償・無償）。ガチャ・ジェムを買う画面・マイページ・上の帯で同じものを見る */
export interface Wallet {
  paid: number;
  free: number;
}

interface WalletStore {
  wallet: Wallet | null;
  /** サーバーから取り直す（取れなければ前の値のまま） */
  load: (token: string | null) => Promise<void>;
  set: (w: Wallet) => void;
}

export const useWallet = create<WalletStore>((set) => ({
  wallet: null,
  load: async (token) => {
    if (!token) return;
    try {
      set({ wallet: await api<Wallet>("/me/wallet", {}, token) });
    } catch {
      // 電波が無い・サーバーが起き上がり中のときは、前の値のまま
    }
  },
  set: (wallet) => set({ wallet }),
}));

/** 合わせたジェムの数 */
export const totalGems = (w: Wallet | null) => (w ? w.paid + w.free : null);

/** 1,500 のように 3 けたごとに区切る */
export const fmt = (n: number) => n.toLocaleString("ja-JP");
