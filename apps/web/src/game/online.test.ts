import { DECKS } from "@trends/cards";
import { type Action, createGame, type GameState } from "@trends/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtinDeck } from "./decks";
import { type Presenter, type RemoteLink, STEP_LIMIT_MS, setPresenter, useGame } from "./store";

/**
 * オンライン対戦で、届いた相手の手を見せる流れ（10月28日：相手の画面だけ、決着の手が出ないまま止まった）。
 * 演出が失敗・停止しても、つなぎ直しが演出の途中に起きても、盤面は最新の手まで進む
 */
const base = (): GameState =>
  createGame({
    decks: { p1: [...DECKS.fixer_meme], p2: [...DECKS.solo_expert] } as never,
    seed: 3,
    first: "p2",
  });
const attack: Action = { type: "attack", player: "p2", from: 0, target: { kind: "leader" } };
const presenter = (p: Partial<Presenter>): Presenter => ({
  beforeAttack: async () => {},
  turnIntro: 0,
  ...p,
});
const link = (ready = vi.fn()): RemoteLink => ({ send: async () => null, resign: () => {}, ready });
const begin = (state: GameState, l = link()) =>
  useGame.getState().startOnline({ deck: builtinDeck("solo_expert"), foeName: "相手", state, link: l });

describe("オンライン対戦：届いた手を見せる", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    setPresenter(null);
    useGame.getState().quit();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("演出が失敗しても、盤面を進めて、あとの手（決着）も見せる", async () => {
    const g = base();
    begin(g);
    setPresenter(presenter({ beforeAttack: () => Promise.reject(new Error("演出で失敗")) }));
    useGame.getState().receive({ action: attack, events: [], state: { ...g, turn: 5 } });
    useGame.getState().receive({ action: attack, events: [], state: { ...g, winner: "p2" } });
    await vi.runAllTimersAsync();
    expect(useGame.getState().game?.winner).toBe("p2");
    expect(useGame.getState().animating).toBe(false);
  });

  it("闇堕ちの演出が終わらなくても、上限を過ぎたら盤面を進める", async () => {
    const g = base();
    begin(g);
    setPresenter(presenter({ darkFall: () => new Promise(() => {}) }));
    useGame.getState().receive({
      action: { type: "endTurn", player: "p1" },
      events: [{ type: "darkFall", player: "p2", slot: 0, cardId: "c14" }],
      state: { ...g, turn: 5 },
    });
    useGame.getState().receive({ action: attack, events: [], state: { ...g, winner: "p2" } });
    await vi.advanceTimersByTimeAsync(STEP_LIMIT_MS - 1);
    expect(useGame.getState().game?.winner).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(useGame.getState().game?.winner).toBe("p2");
  });

  it("効果の演出が上限を過ぎたあとに途中の盤面を出しても、進めた盤面を戻さない", async () => {
    const g = base();
    begin(g);
    let late: (s: GameState) => void = () => {};
    setPresenter(
      presenter({
        resolveEffects: (_shown, _a, _e, _next, show) => {
          late = show;
          return new Promise(() => {});
        },
      }),
    );
    useGame
      .getState()
      .receive({ action: { type: "endTurn", player: "p2" }, events: [], state: { ...g, turn: 7 } });
    await vi.advanceTimersByTimeAsync(STEP_LIMIT_MS);
    expect(useGame.getState().game?.turn).toBe(7);
    late({ ...g, turn: 6 });
    expect(useGame.getState().game?.turn).toBe(7);
  });

  it("演出の途中でつなぎ直したら、古い演出が終わっても、届いた最新の盤面（決着）を上書きしない", async () => {
    const g = base();
    const l = link();
    begin(g, l);
    let release = () => {};
    setPresenter(presenter({ beforeAttack: () => new Promise<void>((r) => (release = r)) }));
    useGame.getState().receive({ action: attack, events: [], state: { ...g, turn: 99 } });
    await vi.advanceTimersByTimeAsync(10);
    // つなぎ直し：サーバーから最新（決着済み）の様子が届く
    begin({ ...g, winner: "p2" }, l);
    release();
    await vi.runAllTimersAsync();
    expect(useGame.getState().game?.winner).toBe("p2");
    expect(useGame.getState().game?.turn).not.toBe(99);
  });

  it("相手の手を見せ始めるたびに foeMove が増える（画面は開いている拡大・確認を閉じる）。自分の手では増えない", async () => {
    const g = base();
    begin(g);
    const before = useGame.getState().foeMove;
    useGame.getState().receive({ action: { type: "endTurn", player: "p1" }, events: [], state: g });
    await vi.runAllTimersAsync();
    expect(useGame.getState().foeMove).toBe(before);
    useGame.getState().receive({ action: attack, events: [], state: g });
    await vi.runAllTimersAsync();
    expect(useGame.getState().foeMove).toBe(before + 1);
  });

  it("自分のターンが始まった手を見せ終えたら、サーバーに知らせる（時計はそこから動く）", async () => {
    const g = base();
    const ready = vi.fn();
    begin(g, link(ready));
    useGame.getState().receive({ action: attack, events: [], state: g });
    await vi.runAllTimersAsync();
    expect(ready).not.toHaveBeenCalled();
    const mine: GameState = { ...g, active: "p1", turn: g.turn + 1 };
    useGame.getState().receive({ action: { type: "endTurn", player: "p2" }, events: [], state: mine });
    await vi.runAllTimersAsync();
    expect(ready).toHaveBeenCalledWith(mine.turn);
  });
});
