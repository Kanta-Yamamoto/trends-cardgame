import { beforeEach, describe, expect, it } from "vitest";
import { builtinDeck } from "./decks";
import { CATALOG, CPU, ME, setPresenter, useGame } from "./store";

describe("対戦ストア", () => {
  beforeEach(() => {
    useGame.setState({ cpuDelay: 0 });
    useGame.getState().start(builtinDeck("solo_idol"), { seed: 8, first: ME });
  });

  it("デッキを選ぶと先攻・後攻が決まり、手札が配られる", () => {
    const g = useGame.getState().game;
    expect(g?.active).toBe(ME);
    expect(g?.players[ME].hand).toHaveLength(3);
    expect(g?.players[CPU].hand).toHaveLength(4);
  });

  it("反則の操作はエラー文を出して状態を変えない", () => {
    const s = useGame.getState();
    const hand = s.game?.players[ME].hand ?? [];
    // 話題力1では出せないアイコン（デッキの中身が変わっても同じことを確かめる）
    const heavy = hand.findIndex((id) => CATALOG[id]?.type === "icon" && (CATALOG[id]?.cost ?? 0) > 1);
    expect(heavy).toBeGreaterThanOrEqual(0);
    s.select({ kind: "hand", index: heavy });
    s.play(0);
    expect(useGame.getState().error).toMatch(/話題力が足りません/);
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

  it("CPU が先攻ならすぐ CPU が1ターン動く", () => {
    useGame.getState().start(builtinDeck("solo_flame"), { seed: 3, first: CPU });
    expect(useGame.getState().game?.active).toBe(ME);
    expect(useGame.getState().game?.turn).toBe(2);
  });

  it("ターン終了だけを続けても、最後は勝敗がつく", () => {
    for (let i = 0; i < 40 && !useGame.getState().game?.winner; i++) useGame.getState().endTurn();
    expect(useGame.getState().game?.winner).toBe(CPU);
  });
  it("『フィクサー』：CPU はすぐ差し出し、自分が選ぶと両方が倒される", () => {
    const g = structuredClone(useGame.getState().game);
    if (!g) throw new Error("no game");
    g.players[ME].mana = 30;
    g.players[ME].hand = ["n1", "c15"];
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
      g.players[ME].hand = ["n1", "c15"];
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
