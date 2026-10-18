import { CARDS, DECK_OSHI, DECKS } from "@trends/cards";
import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "./engine";
import type { RuleCard } from "./types";
import { actionFor, actionFrom, eventsFor, HIDDEN_CARD, stateFor } from "./view";

const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, RuleCard>;
const game = () =>
  createGame({
    decks: { p1: DECKS.flame, p2: DECKS.idol },
    oshi: { p1: DECK_OSHI.flame, p2: DECK_OSHI.idol },
    seed: 5,
    first: "p1",
  });

describe("オンライン対戦で渡す形", () => {
  it("相手の手札・両者の山札・乱数の種は隠し、枚数は分かる", () => {
    const s = game();
    const v = stateFor(s, "p1");
    expect(v.seed).toBe(0);
    expect(v.players.p1.hand).toEqual(s.players.p1.hand);
    expect(v.players.p2.hand).toEqual(s.players.p2.hand.map(() => HIDDEN_CARD));
    expect(v.players.p1.deck).toHaveLength(s.players.p1.deck.length);
    expect(v.players.p1.deck.every((c) => c === HIDDEN_CARD)).toBe(true);
    expect(v.players.p2.deck.every((c) => c === HIDDEN_CARD)).toBe(true);
  });

  it("p2 の人には、自分が p1 に見えるように入れ替える", () => {
    const s = game();
    const v = stateFor(s, "p2");
    expect(v.players.p1.hand).toEqual(s.players.p2.hand);
    expect(v.players.p2.hand).toHaveLength(s.players.p1.hand.length);
    expect(v.active).toBe("p2"); // 本当は p1（先攻）の番 → p2 の人から見ると相手の番
  });

  it("相手が引いたカードは隠し、出来事のプレイヤーも入れ替える", () => {
    const { events } = applyAction(game(), { type: "endTurn", player: "p1" }, catalog);
    const forP1 = eventsFor(events, "p1");
    const forP2 = eventsFor(events, "p2");
    const drewP1 = forP1.find((e) => e.type === "drew");
    const drewP2 = forP2.find((e) => e.type === "drew");
    expect(drewP1).toMatchObject({ player: "p2", cardId: HIDDEN_CARD });
    expect(drewP2?.type === "drew" && drewP2.player).toBe("p1");
    expect(drewP2?.type === "drew" && drewP2.cardId).not.toBe(HIDDEN_CARD);
  });

  it("操作の向きをそろえる", () => {
    const a = { type: "attack", player: "p1", from: 0, target: { kind: "leader" } } as const;
    expect(actionFor(a, "p2").player).toBe("p2");
    expect(actionFrom(a, "p2").player).toBe("p2");
    expect(actionFor(a, "p1")).toEqual(a);
  });

  it("降参すると相手の勝ち（相手のターンでもできる）", () => {
    const r = applyAction(game(), { type: "resign", player: "p2" }, catalog);
    expect(r.state.winner).toBe("p1");
    expect(r.events.map((e) => e.type)).toEqual(["resigned", "won"]);
  });
});
