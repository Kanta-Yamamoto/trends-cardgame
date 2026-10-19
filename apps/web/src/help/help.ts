import type { CardDef } from "@trends/cards";
import { create } from "zustand";

/** 効果文の語（キーワード・状態・闇堕ち）の解説。カードの語を押すと小窓で見せる */
export const HELP: Record<
  string,
  { title: string; text: string; kind: "keyword" | "state" | "dark" | "word" }
> = {
  ガード: {
    title: "ガード",
    text: "相手の場にガードがいる間、相手はガードしか攻撃できない。マスターもほかのアイコンも守られる。",
    kind: "keyword",
  },
  速攻: {
    title: "速攻",
    text: "場に出たターンに攻撃できる（相手のアイコンにもマスターにも）。",
    kind: "keyword",
  },
  凸: {
    title: "凸（とつ）",
    text: "場に出たターンに、相手のアイコンにだけ攻撃できる（マスターは攻撃できない）。次のターンからは普通に攻撃できる。「凸で攻撃したとき、攻撃力+N・体力+N」を持つカードは、上がった攻撃力で殴る。",
    kind: "keyword",
  },
  連撃: { title: "連撃", text: "1ターンに2回攻撃できる。", kind: "keyword" },
  注目: {
    title: "注目",
    text: "自分のターンの始めに攻撃力+1。真ん中の枠（センター）にいると+2。",
    kind: "keyword",
  },
  ノリ: {
    title: "ノリ",
    text: "場に出たとき、このターンに先に出したほかのカード1枚につき攻撃力+1。",
    kind: "word",
  },
  闇堕ち: {
    title: "闇堕ち",
    text: "闇堕ちを持つ★5がオワコンに行ったら、自分のターンの好きなときに、コストなしで闇堕ちの姿で場に戻せる（1枚につき1回）。戻ったターンから相手のアイコンに攻撃できる（凸）。「闇堕ちしたとき」の効果も働く。",
    kind: "dark",
  },
  晒し者: {
    title: "晒し者",
    text: "ガードを失い、それまでの強化（プラスの分）がすべて消える。ずっと続く（晒されたあとの強化は消えない）。癒しの「TL浄化」で元に戻る。",
    kind: "state",
  },
  眠り: { title: "眠り", text: "眠っているアイコンは、次の自分のターンまで攻撃できない。", kind: "state" },
  訂正済み: { title: "訂正済み", text: "キーワードと効果が消えている（ガードも無くなる）。", kind: "state" },
  無敵: {
    title: "無敵",
    text: "マスターは、次の相手のターンが終わるまでダメージを受けない。",
    kind: "state",
  },
  炎上商法: {
    title: "炎上商法",
    text: "このターン攻撃力+3。自分のターンの終わりに、そのアイコンが晒し者になる（ガードと強化が消える）。",
    kind: "word",
  },
  トークン: {
    title: "トークン",
    text: "効果で生まれるアイコン（草など）。オワコンに行くと消える。",
    kind: "word",
  },
};

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
