import { type CardDef, TERMS } from "@trends/cards";
import { create } from "zustand";

/** 効果文の語（キーワード・状態・闇堕ち など）の解説。元は用語集（@trends/cards の TERMS）。カードの語を押すと小窓で見せる */
export const HELP = TERMS;

/** 効果文の中で押せる語（長いものから先に見つける） */
export const HELP_TERMS = Object.keys(HELP).sort((a, b) => b.length - a.length);

interface HelpStore {
  term: string | null;
  /** 闇堕ちの解説で、そのカードの闇堕ちの姿も見せる */
  card: CardDef | null;
  open: (term: string, card?: CardDef) => void;
  close: () => void;
}

export const useHelp = create<HelpStore>((set) => ({
  term: null,
  card: null,
  open: (term, card) => set({ term, card: card ?? null }),
  close: () => set({ term: null, card: null }),
}));
