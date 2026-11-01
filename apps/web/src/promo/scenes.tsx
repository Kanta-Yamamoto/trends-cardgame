// SNS の自己紹介の動画で撮る場面（手元だけ）。本物の盤面（Board）・開封（Opening）を、決めた盤面・決めたパックで出す。
// 撮るのは tools/promo-video.mjs。動かすのは window.promo（手札を出す・攻撃する・パックをなぞる）

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTutorialGame, type GameState, type PlayerId, SLOTS, type Unit } from "@trends/game-core";
import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { AppScroll } from "../AppScroll";
import { FRAME_ID } from "../frame";
import { Opening } from "../gacha/Opening";
import { CPU, ME, useGame } from "../game/store";
import { Board } from "../pages/Play";
import "../styles/gacha.css";

/** 盤面の 1 体（前のターンから場にいて、攻撃できる） */
const unit = (uid: number, cardId: string): Unit => ({
  uid,
  cardId,
  damage: 0,
  canAttack: true,
  attacksLeft: 1,
  atkBuff: 0,
  hpBuff: 0,
  dark: false,
  darkUsed: false,
  exposed: false,
  boundUntil: 0,
  silenced: false,
  noGuard: false,
  token: false,
});

interface Setup {
  /** 自分・相手の場（枠の番号 → カード） */
  me: Record<number, string>;
  foe: Record<number, string>;
  hand: string[];
  mana: number;
  foeLp?: number;
  myDeck?: string[];
  foeDeck?: string[];
  /** このゲームで出したガードの数（ネ申のコストが下がる） */
  guardsPlayed?: number;
}

/** チュートリアルの盤面を元に、場・手札・コストを決めた盤面にする（自分のターンの途中から） */
function board(s: Setup): GameState {
  const g = createTutorialGame();
  let uid = 1;
  const field = (m: Record<number, string>) =>
    Array.from({ length: SLOTS }, (_, i) => (m[i] ? unit(uid++, m[i]) : null));
  const me = field(s.me);
  const foe = field(s.foe);
  const p = (id: PlayerId) => g.players[id];
  // 自分は p1（ME）、相手は p2（CPU）
  return {
    ...g,
    nextUid: uid,
    players: {
      p1: {
        ...p(ME),
        lp: 14,
        mana: s.mana,
        maxMana: s.mana,
        hand: s.hand,
        field: me,
        trash: [],
        darkOmens: [],
        deck: s.myDeck ?? p(ME).deck,
        guardsPlayed: s.guardsPlayed ?? 0,
      },
      p2: {
        ...p(CPU),
        lp: s.foeLp ?? 12,
        field: foe,
        trash: [],
        deck: s.foeDeck ?? p(CPU).deck,
      },
    },
  };
}

/** 場面ごとの盤面。手札の 1 枚目を出す（勝ちは、自分の枠 1 で相手のプレイヤーを攻撃する） */
const BOARDS: Record<string, Setup> = {
  // ネ申の降臨：神から手札へ 3 枚が飛ぶ
  god: {
    me: { 0: "g2", 1: "c1", 3: "g13" },
    foe: { 1: "f10", 2: "c4", 3: "n13" },
    hand: ["g20", "n10", "k3"],
    mana: 10,
    guardsPlayed: 3,
  },
  // 『調停者』：攻撃力がいちばん高い相手の 2 体を光線で突く
  arbiter: {
    me: { 0: "k7", 1: "c6" },
    foe: { 0: "m9", 2: "n13", 4: "k3" },
    hand: ["c16", "n10", "f2"],
    mana: 5,
  },
  // 『演出家』：自分と相手の山札から、闇堕ちを持つカードが舞台に上がる
  director: {
    me: { 0: "m7" },
    foe: { 1: "f22", 4: "k3" },
    hand: ["c17", "n10", "f2"],
    mana: 5,
    myDeck: ["m17", "m19", "c13", "m21", "m12"],
    foeDeck: ["f6", "f13", "c9", "f2", "f3"],
  },
  // 『フィクサー』：場が黒に滲み、自分と相手が 1 体ずつ差し出す
  fixer: {
    me: { 0: "k7", 2: "c10" },
    foe: { 0: "m9", 2: "n13", 3: "f2" },
    hand: ["c15", "n10", "f2"],
    mana: 5,
  },
  // 勝ち：カグラで相手のプレイヤーを攻撃して、ライフを 0 にする
  win: {
    me: { 1: "c9", 3: "m9" },
    foe: { 2: "k3" },
    hand: ["n10", "f2"],
    mana: 6,
    foeLp: 3,
  },
};

/** パックの 5 枚（5 枚目が★5 のミナモ） */
const PACK = ["k3", "f6", "n6", "g12", "c3"].map((id) => ({ id, isNew: false }));

export function mountScene(root: Root, scene: string) {
  const qc = new QueryClient();
  const frame = (child: React.ReactNode) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div id={FRAME_ID} className="app-frame">
          <AppScroll>{child}</AppScroll>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );

  if (scene === "gacha") {
    flushSync(() =>
      root.render(
        frame(
          <section className="page gacha">
            <Opening packs={[PACK]} onClose={() => {}} onAgain={() => {}} />
          </section>,
        ),
      ),
    );
    return;
  }

  const setup = BOARDS[scene];
  if (!setup) throw new Error(`場面がありません：${scene}`);
  useGame.setState({
    mode: "cpu",
    foeName: "CPU",
    deck: { ref: "promo", name: "", text: "", cards: [], attrs: [] },
    foeDeckRef: null,
    game: board(setup),
    log: [],
    error: null,
    selection: null,
    cpuBusy: false,
    animating: false,
  });
  flushSync(() =>
    root.render(
      frame(
        <section className="page play">
          <Board />
        </section>,
      ),
    ),
  );
}

/** 撮る側（tools/promo-video.mjs）から呼ぶ操作 */
export const promoActions = {
  /** 手札の index 枚目を、自分の枠 slot に出す */
  play: (index: number, slot: number) => {
    useGame.getState().select({ kind: "hand", index });
    useGame.getState().play(slot);
  },
  /** 自分の枠 slot のキャラクターで、相手のプレイヤーを攻撃する */
  attackLeader: (slot: number) => {
    useGame.getState().select({ kind: "attacker", slot });
    useGame.getState().attack({ kind: "leader" });
  },
  /** 差し出し（『フィクサー』）で、自分の枠 slot のキャラクターを選ぶ */
  sacrifice: (slot: number) => useGame.getState().sacrifice(slot),
};
