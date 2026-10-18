import { type Attribute, type CardDef, DECKS, type DeckId } from "@trends/cards";
import {
  deckAttributes,
  encodeCustomDeck,
  isCustomDeckRef,
  resolveDeckRef,
  validateDeck,
} from "@trends/game-core";
import { CATALOG, DECK_INFO } from "./store";

/**
 * 対戦で使うデッキの指し方。構築済みデッキ（DECKS の ID）と、自分で組んで保存したデッキの両方をこの形で扱う。
 * ref は構築済みなら ID、自分のデッキなら "custom:…"（オンライン対戦でサーバーに送る文字列）
 */
export interface DeckSel {
  ref: string;
  name: string;
  text: string;
  cards: string[];
  attrs: Attribute[];
}

/** 自分で組んで端末に保存したデッキ */
export interface CustomDeck {
  id: string;
  name: string;
  cards: string[];
  /** 保存した時刻（ミリ秒） */
  updated: number;
}

const KEY = "trends.customDecks";
const CUSTOM_NAME = "自分のデッキ";

export const attrsOf = (cards: readonly string[]) => deckAttributes(cards, CATALOG) as Attribute[];

export function builtinDeck(id: DeckId): DeckSel {
  const cards = [...DECKS[id]];
  return { ref: id, name: DECK_INFO[id].name, text: DECK_INFO[id].text, cards, attrs: attrsOf(cards) };
}

export function customDeckSel(d: CustomDeck): DeckSel {
  const cards = [...d.cards];
  const attrs = attrsOf(cards);
  return {
    ref: encodeCustomDeck(cards),
    name: d.name || CUSTOM_NAME,
    text: `${attrs.length > 0 ? attrs.join("×") : "共通"}。自分で組んだデッキ`,
    cards,
    attrs,
  };
}

/** ref（構築済みの ID か custom:…）から DeckSel を戻す。自分のデッキは保存してある名前を探す */
export function deckFromRef(ref: string): DeckSel | null {
  if (ref in DECKS) return builtinDeck(ref as DeckId);
  const cards = resolveDeckRef(ref, DECKS);
  if (!cards || !isCustomDeckRef(ref)) return null;
  const saved = loadCustomDecks().find((d) => encodeCustomDeck(d.cards) === ref);
  return customDeckSel(saved ?? { id: "", name: CUSTOM_NAME, cards, updated: 0 });
}

export function loadCustomDecks(): CustomDeck[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (d): d is CustomDeck =>
        !!d &&
        typeof d === "object" &&
        typeof (d as CustomDeck).id === "string" &&
        typeof (d as CustomDeck).name === "string" &&
        Array.isArray((d as CustomDeck).cards),
    );
  } catch {
    return [];
  }
}

export function saveCustomDecks(list: CustomDeck[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newDeckId() {
  return `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** デッキの決まりを確かめる（30枚・3枚まで・属性2つまで・トークン不可） */
export const deckErrors = (cards: readonly string[]) => validateDeck(cards, CATALOG);

/** コストごとの枚数（1〜6 と 7 以上） */
export function costCurve(cards: readonly string[]): number[] {
  const curve = [0, 0, 0, 0, 0, 0, 0];
  for (const id of cards) {
    const c = CATALOG[id] as CardDef | undefined;
    if (!c) continue;
    const i = Math.min(7, Math.max(1, c.cost)) - 1;
    curve[i] = (curve[i] ?? 0) + 1;
  }
  return curve;
}
