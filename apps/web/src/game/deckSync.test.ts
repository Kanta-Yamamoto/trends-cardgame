import { describe, expect, it } from "vitest";
import { mergeDecks } from "./deckSync";
import type { CustomDeck } from "./decks";

const d = (id: string, updated = 1, name = id): CustomDeck => ({ id, name, cards: ["f1"], updated });

describe("mergeDecks（端末とアカウントのデッキを合わせる）", () => {
  it("初めてログインした端末のデッキは、アカウントに足して送る", () => {
    const r = mergeDecks([d("a")], [d("b")], new Set());
    expect(r.decks.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r.upload).toBe(true);
  });

  it("アカウントにだけあるデッキは端末に足す（送り直さない）", () => {
    const r = mergeDecks([], [d("b"), d("c")], new Set());
    expect(r.decks.map((x) => x.id)).toEqual(["b", "c"]);
    expect(r.upload).toBe(false);
  });

  it("両方にあるデッキは、保存した時刻が新しいほうを使う", () => {
    const newerHere = mergeDecks([d("a", 5, "端末")], [d("a", 3, "アカウント")], new Set(["a"]));
    expect(newerHere.decks[0]?.name).toBe("端末");
    expect(newerHere.upload).toBe(true);
    const newerThere = mergeDecks([d("a", 3, "端末")], [d("a", 5, "アカウント")], new Set(["a"]));
    expect(newerThere.decks[0]?.name).toBe("アカウント");
    expect(newerThere.upload).toBe(false);
  });

  it("前にそろえたのにアカウントから消えたデッキは、ほかの端末で消したとみなす", () => {
    const r = mergeDecks([d("a"), d("b")], [d("b")], new Set(["a", "b"]));
    expect(r.decks.map((x) => x.id)).toEqual(["b"]);
    expect(r.upload).toBe(false);
  });
});
