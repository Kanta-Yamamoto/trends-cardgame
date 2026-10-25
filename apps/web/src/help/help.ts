import { CARDS, type CardDef, TERMS } from "@trends/cards";
import { create } from "zustand";

/** 効果文の語（キーワード・状態・闇堕ち など）の解説。元は用語集（@trends/cards の TERMS）。カードの語を押すと小窓で見せる */
export const HELP = TERMS;

/**
 * 効果文に名前が出てくるトークン（盾・裁きの雷・リスナー など）。押すとそのカードの効果を小窓で見せる。
 * 用語集に解説がある名前（草）と、デッキに入るカードと同じ名前（伝説のコラ画像）は除く
 */
export const TOKEN_CARDS: Readonly<Record<string, CardDef>> = Object.fromEntries(
  CARDS.filter((c) => c.token && !HELP[c.name] && !CARDS.some((o) => !o.token && o.name === c.name)).map(
    (c) => [c.name, c],
  ),
);

/** 効果文の中で押せる語とトークンの名前（長いものから先に見つける） */
export const HELP_TERMS = [...Object.keys(HELP), ...Object.keys(TOKEN_CARDS)].sort(
  (a, b) => b.length - a.length,
);

interface HelpStore {
  term: string | null;
  /** 闇堕ちの解説で、そのカードの闇堕ちの姿も見せる */
  card: CardDef | null;
  /** 効果文に名前が出てくるトークンの効果を見せる */
  token: CardDef | null;
  open: (term: string, card?: CardDef) => void;
  openToken: (token: CardDef) => void;
  close: () => void;
}

export const useHelp = create<HelpStore>((set) => ({
  term: null,
  card: null,
  token: null,
  open: (term, card) => set({ term, card: card ?? null, token: null }),
  openToken: (token) => set({ term: null, card: null, token }),
  close: () => set({ term: null, card: null, token: null }),
}));
