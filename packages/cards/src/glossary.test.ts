import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNED_TERMS, CARDS, KEYWORD_ORDER, PROPER_NAMES, TERMS, termViolations } from "./index";

/** 効果文（元の姿と闇堕ちの姿） */
const TEXTS = CARDS.flatMap((c) => [
  {
    id: c.id,
    text: c.effect,
    keywords: [...c.keywords] as string[],
    combo: c.effects.some((e) => e.do === "buffSelfPerPlayed"),
  },
  ...(c.dark
    ? [{ id: `${c.id}.dark`, text: c.dark.effect, keywords: [...c.dark.keywords] as string[], combo: false }]
    : []),
]);

const STATES = Object.entries(TERMS)
  .filter(([, t]) => t.kind === "state")
  .map(([k]) => k);

describe("効果文は用語集に沿う（docs/card-text.md）", () => {
  it("使わない呼び名を使っていない（カード名の中は除く）", () => {
    for (const { id, text } of TEXTS)
      expect({ id, found: termViolations(text, PROPER_NAMES) }).toEqual({ id, found: [] });
  });

  it("括弧で説明しない・数字は半角・+N/+N と書かない", () => {
    for (const { id, text } of TEXTS) {
      expect({ id, bad: /[（）()]/.test(text) }).toEqual({ id, bad: false });
      expect({ id, bad: /[０-９]/.test(text) }).toEqual({ id, bad: false });
      expect({ id, bad: /\d+\/\d+/.test(text) }).toEqual({ id, bad: false });
    }
  });

  it("文の終わりに「。」を付ける", () => {
    for (const { id, text } of TEXTS)
      if (text) expect({ id, end: text.endsWith("。") }).toEqual({ id, end: true });
  });

  it("キーワードは、決まった順に「。」で区切って先頭に書く", () => {
    for (const { id, text, keywords, combo } of TEXTS) {
      const has = new Set([...keywords, ...(combo ? ["コンボ"] : [])]);
      const head = KEYWORD_ORDER.filter((k) => has.has(k))
        .map((k) => `${k}。`)
        .join("");
      expect({ id, head: text.startsWith(head) }).toEqual({ id, head: true });
      // 先頭のキーワードのあとに、別のキーワードだけの文を続けない
      const rest = text.slice(head.length);
      for (const k of KEYWORD_ORDER)
        expect({ id, k, again: rest.startsWith(`${k}。`) }).toEqual({ id, k, again: false });
    }
  });

  it("「〇〇状態」は用語集に登録した状態だけ", () => {
    for (const { id, text } of TEXTS) {
      let rest = text;
      for (const s of STATES) rest = rest.split(s).join("");
      // 「強化と状態を消す」のような、状態そのものを指す書き方はよい
      expect({ id, unknown: /状態(?!を)/.test(rest) }).toEqual({ id, unknown: false });
    }
  });
});

describe("用語集", () => {
  it("解説の文も、使わない呼び名を使っていない", () => {
    for (const [k, t] of Object.entries(TERMS))
      expect({ k, found: termViolations(t.text, PROPER_NAMES) }).toEqual({ k, found: [] });
  });

  it("キーワードには、すべて解説がある", () => {
    for (const k of KEYWORD_ORDER) expect(TERMS[k]?.kind).toBe("keyword");
  });

  it("押せる語と使わない呼び名は、すべて docs/glossary.md に載っている", () => {
    const doc = readFileSync(new URL("../../../docs/glossary.md", import.meta.url), "utf8");
    for (const k of Object.keys(TERMS)) expect({ k, inDoc: doc.includes(k) }).toEqual({ k, inDoc: true });
    for (const { word } of BANNED_TERMS) {
      const w = typeof word === "string" ? word : "倒す";
      expect({ w, inDoc: doc.includes(w) }).toEqual({ w, inDoc: true });
    }
  });
});
