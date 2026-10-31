import { beforeEach, describe, expect, it, vi } from "vitest";
import { cpuLogForTest } from "./cpuLog";
import { builtinDeck } from "./decks";
import { CATALOG, CPU, ME, STEP_LIMIT_MS, setPresenter, useGame } from "./store";

describe("対戦ストア", () => {
  beforeEach(() => {
    useGame.setState({ cpuDelay: 0 });
    useGame.getState().start(builtinDeck("solo_idol"), { seed: 8, first: ME });
    // 始めの引き直しは、引き直さずに進める（CPU は始めにすぐ選ぶ）
    useGame.getState().mulligan([]);
  });

  it("デッキを選ぶと先攻・後攻が決まり、手札が配られる", () => {
    const g = useGame.getState().game;
    expect(g?.active).toBe(ME);
    expect(g?.players[ME].hand).toHaveLength(3);
    expect(g?.players[CPU].hand).toHaveLength(4);
  });

  it("始めに手札を引き直す。CPU はすぐ選び、自分が選ぶまでほかの操作はできない", () => {
    useGame.getState().start(builtinDeck("solo_idol"), { seed: 8, first: ME });
    const g = useGame.getState().game;
    expect(g?.mulligan).toEqual({ waiting: [ME] });
    expect(useGame.getState().log.some((l) => l.e.type === "mulliganed" && l.e.player === CPU)).toBe(true);
    useGame.getState().endTurn();
    expect(useGame.getState().game?.turn).toBe(1);
    const before = g?.players[ME].hand ?? [];
    useGame.getState().mulligan([0, 1]);
    const after = useGame.getState().game;
    expect(after?.mulligan).toBeNull();
    expect(after?.players[ME].hand[2]).toBe(before[2]);
    expect(after?.players[ME].hand).toHaveLength(3);
  });

  it("反則の操作はエラー文を出して状態を変えない", () => {
    const s = useGame.getState();
    const hand = s.game?.players[ME].hand ?? [];
    // コスト1では出せないキャラクター（デッキの中身が変わっても同じことを確かめる）
    const heavy = hand.findIndex((id) => CATALOG[id]?.type === "icon" && (CATALOG[id]?.cost ?? 0) > 1);
    expect(heavy).toBeGreaterThanOrEqual(0);
    s.select({ kind: "hand", index: heavy });
    s.play(0);
    expect(useGame.getState().error).toMatch(/コストが足りません/);
    expect(useGame.getState().game?.players[ME].field[0]).toBeNull();
  });

  it("ターン終了すると CPU が動いて、こちらの番に戻る", () => {
    useGame.getState().endTurn();
    const s = useGame.getState();
    expect(s.game?.active).toBe(ME);
    expect(s.game?.turn).toBe(3);
    expect(s.cpuBusy).toBe(false);
    expect(s.log.some((l) => l.e.type === "turnStarted" && l.e.player === CPU)).toBe(true);
  });

  it("CPU 対戦を一手ずつ記録し（CPU が考えた中身つき）、途中でやめたらそこまでを送る", () => {
    useGame.getState().endTurn();
    const cur = cpuLogForTest().current;
    expect(cur?.human).toBe(ME);
    expect(cur?.cpu).toBe(CPU);
    expect(cur?.humanDeck.ref).toBe("solo_idol");
    // 始めの引き直し（CPU・自分）のあとに、自分のターン終了
    expect(cur?.moves[0]?.action.type).toBe("mulligan");
    expect(cur?.moves[1]?.action).toEqual({ type: "mulligan", player: ME, handIndexes: [] });
    expect(cur?.moves[2]?.action).toEqual({ type: "endTurn", player: ME });
    // CPU の手も入る（CPU のターンの最後はターン終了）
    expect(cur?.moves.some((m) => m.action.type === "endTurn" && m.action.player === CPU)).toBe(true);
    expect(cur?.thoughts.length).toBeGreaterThan(0);
    expect(cur?.thoughts[0]?.move).toBe(3);
    // CPU が出したカードには ID が付き、デッキのカードのそのときのデータも残る（出すまで何ターンか進める）
    for (let i = 0; i < 6 && !cur?.moves.some((m) => m.action.type === "play"); i++)
      useGame.getState().endTurn();
    const play = cur?.moves.find((m) => m.action.type === "play");
    expect(play?.card).toBeTypeOf("string");
    expect(cur?.cardData?.[play?.card ?? ""]?.cost).toBeTypeOf("number");
    const moves = cur?.moves.length ?? 0;
    useGame.getState().quit();
    const sent = cpuLogForTest().last;
    expect(sent?.moves).toHaveLength(moves);
    expect(sent?.end.winner).toBeNull();
    expect(cpuLogForTest().current).toBeNull();
  });

  it("CPU が先攻ならすぐ CPU が1ターン動く", () => {
    useGame.getState().start(builtinDeck("solo_flame"), { seed: 3, first: CPU });
    // CPU は自分が引き直しを選ぶのを待ってから動く
    expect(useGame.getState().game?.turn).toBe(1);
    useGame.getState().mulligan([]);
    expect(useGame.getState().game?.active).toBe(ME);
    expect(useGame.getState().game?.turn).toBe(2);
  });

  it("ターン終了だけを続けても、最後は勝敗がつく", () => {
    for (let i = 0; i < 40 && !useGame.getState().game?.winner; i++) useGame.getState().endTurn();
    expect(useGame.getState().game?.winner).toBe(CPU);
  });
  it("『フィクサー』：CPU はすぐ差し出し、自分が選ぶと両方が破壊される", () => {
    const g = structuredClone(useGame.getState().game);
    if (!g) throw new Error("no game");
    g.players[ME].mana = 30;
    g.players[ME].hand = ["n2", "c15"];
    g.players[CPU].field[0] = {
      uid: 900,
      cardId: "n5",
      damage: 0,
      canAttack: false,
      attacksLeft: 0,
      atkBuff: 0,
      hpBuff: 0,
      dark: false,
      darkUsed: false,
      exposed: false,
      boundUntil: 0,
      silenced: false,
      noGuard: false,
      token: false,
    };
    useGame.setState({ game: g });
    const s = useGame.getState();
    s.select({ kind: "hand", index: 0 });
    useGame.getState().play(0);
    useGame.getState().select({ kind: "hand", index: 0 });
    useGame.getState().play(1);
    // CPU はもう選んだので、待っているのは自分だけ
    expect(useGame.getState().game?.pending?.waiting).toEqual([ME]);
    useGame.getState().sacrifice(0);
    const after = useGame.getState().game;
    expect(after?.pending ?? null).toBeNull();
    expect(after?.players[ME].field[0]).toBeNull();
    expect(after?.players[CPU].field[0]).toBeNull();
    expect(after?.players[ME].field[1]?.cardId).toBe("c15");
  });

  it("『フィクサー』：演出があるときは、差し出しが決まった操作も演出を見せてから盤面を進める", async () => {
    const shown: { type: string; gone: number }[] = [];
    setPresenter({
      beforeAttack: async () => {},
      turnIntro: 0,
      resolveEffects: async (_s, a, events) => {
        shown.push({ type: a.type, gone: events.filter((e) => e.type === "sacrificed").length });
      },
    });
    try {
      const g = structuredClone(useGame.getState().game);
      if (!g) throw new Error("no game");
      g.players[ME].mana = 30;
      g.players[ME].hand = ["n2", "c15"];
      g.players[CPU].field[0] = {
        uid: 902,
        cardId: "n5",
        damage: 0,
        canAttack: false,
        attacksLeft: 0,
        atkBuff: 0,
        hpBuff: 0,
        dark: false,
        darkUsed: false,
        exposed: false,
        boundUntil: 0,
        silenced: false,
        noGuard: false,
        token: false,
      };
      useGame.setState({ game: g });
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 400 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
      };
      const idle = () => !useGame.getState().animating;
      useGame.getState().select({ kind: "hand", index: 0 });
      useGame.getState().play(0);
      await until(idle);
      useGame.getState().select({ kind: "hand", index: 0 });
      useGame.getState().play(1);
      await until(() => idle() && !!useGame.getState().game?.pending?.waiting.every((p) => p === ME));
      expect(useGame.getState().game?.pending?.waiting).toEqual([ME]);
      useGame.getState().sacrifice(0);
      await until(() => idle() && !useGame.getState().game?.pending);
      const after = useGame.getState().game;
      expect(after?.players[ME].field[0]).toBeNull();
      expect(after?.players[CPU].field[0]).toBeNull();
      // CPU の差し出し（まだ待ちが残る）と、自分の差し出し（2体が引き抜かれる）の両方が演出を通った
      expect(shown.filter((x) => x.type === "sacrifice")).toEqual([
        { type: "sacrifice", gone: 0 },
        { type: "sacrifice", gone: 2 },
      ]);
    } finally {
      setPresenter(null);
    }
  });

  it("【場に出たとき】に自分が強化されるキャラクター（クサハミ）は、効果を見せる間は強化前の数字で置く", async () => {
    const placed: (number | undefined)[] = [];
    setPresenter({
      beforeAttack: async () => {},
      turnIntro: 0,
      resolveEffects: async (shown, a) => {
        if (a.type === "play") placed.push(shown.players[ME].field[a.slot]?.atkBuff);
      },
    });
    try {
      const g = structuredClone(useGame.getState().game);
      if (!g) throw new Error("no game");
      g.players[ME].mana = 10;
      g.players[ME].hand = ["c14"];
      g.players[ME].field = g.players[ME].field.map(() => null);
      g.players[ME].tokensLost = { "t-kusa": 2 };
      useGame.setState({ game: g });
      useGame.getState().select({ kind: "hand", index: 0 });
      useGame.getState().play(0);
      for (let i = 0; i < 400 && useGame.getState().animating; i++)
        await new Promise((r) => setTimeout(r, 5));
      // 効果を見せる間は +0、見せ終えたら破壊された草 2 体ぶんの +2
      expect(placed).toEqual([0]);
      expect(useGame.getState().game?.players[ME].field[0]?.atkBuff).toBe(2);
    } finally {
      setPresenter(null);
    }
  });

  // 10月30日：演出が失敗・停止すると animating が戻らず、選んだ手札が持ち上がったまま、ターン終了とバズが押せなかった
  for (const [kind, resolveEffects] of [
    ["失敗", () => Promise.reject(new Error("演出の失敗"))],
    ["停止", () => new Promise<void>(() => {})],
  ] as const) {
    it(`演出が${kind}しても、上限で切り上げて盤面を進め、操作できる状態に戻す`, async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      setPresenter({ beforeAttack: async () => {}, turnIntro: 0, resolveEffects });
      try {
        const g = structuredClone(useGame.getState().game);
        if (!g) throw new Error("no game");
        g.players[ME].mana = 10;
        g.players[ME].hand = ["c14"];
        g.players[ME].field = g.players[ME].field.map(() => null);
        useGame.setState({ game: g });
        useGame.getState().select({ kind: "hand", index: 0 });
        useGame.getState().play(0);
        expect(useGame.getState().animating).toBe(true);
        await vi.advanceTimersByTimeAsync(STEP_LIMIT_MS);
        expect(useGame.getState().animating).toBe(false);
        expect(useGame.getState().selection).toBeNull();
        expect(useGame.getState().game?.players[ME].field[0]?.cardId).toBe("c14");
      } finally {
        setPresenter(null);
        warn.mockRestore();
        vi.useRealTimers();
      }
    });
  }

  for (const delay of [0, 5]) {
    it(`『フィクサー』：CPU が出したら自分が選び、そのあと CPU がターンを続けて終える（待ち時間 ${delay}）`, async () => {
      useGame.setState({ cpuDelay: delay });
      const g = structuredClone(useGame.getState().game);
      if (!g) throw new Error("no game");
      g.players[ME].field[0] = {
        uid: 901,
        cardId: "n5",
        damage: 0,
        canAttack: false,
        attacksLeft: 0,
        atkBuff: 0,
        hpBuff: 0,
        dark: false,
        darkUsed: false,
        exposed: false,
        boundUntil: 0,
        silenced: false,
        noGuard: false,
        token: false,
      };
      g.players[CPU].hand = ["c15"];
      // 引くカードも『フィクサー』にする（コストが足りず出せない。引いたカードで場が変わり、CPU も差し出す番にならないように）
      g.players[CPU].deck.unshift("c15");
      g.players[CPU].maxMana = 3;
      g.players[CPU].field = g.players[CPU].field.map(() => null);
      useGame.setState({ game: g });
      useGame.getState().endTurn();
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 400 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
      };
      await until(() => !!useGame.getState().game?.pending);
      expect(useGame.getState().game?.pending?.waiting).toEqual([ME]);
      useGame.getState().sacrifice(0);
      await until(() => useGame.getState().game?.active === ME && !useGame.getState().cpuBusy);
      expect(useGame.getState().game?.pending ?? null).toBeNull();
      expect(useGame.getState().game?.active).toBe(ME);
      expect(useGame.getState().cpuBusy).toBe(false);
    });
  }
});
