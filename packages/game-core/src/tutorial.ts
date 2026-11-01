import { type Action, DEFAULT_CONFIG, type GameState, type PlayerId, SLOTS, type Unit } from "./types";

/**
 * チュートリアルの対戦（10月27日。オーナー：「基本のキャラ出し、呪文出し、闇堕ち、プレイヤー殴りで残り5体力とかを削って勝ち」）。
 * 11月1日に、レンが破壊されるところから見せる形にした（オーナー：「レンが前のターンに破壊されるところもしっかりと表現しておきたい」
 * 「主語をレンが倒すとかでもいい」）。3 ターンの盤面：
 * 1. 自分のターン（コストは使い切っている）：レンで、手負いの古参（4/4 に 2 ダメージ）を攻撃して相打ち。レンは裏向きのカードになる → ターン終了
 * 2. 相手のターン：相手はガードの有識者ニキを出すだけ（tutorialFoeTurn。CPU は考えない）
 * 3. 自分のターン（コスト 4・切り抜き職人を引く）：キャラクターを出す → 呪文でガードを破壊する → 闇堕ちさせる
 *    → 2 体でプレイヤーを攻撃する（4 + 1 = 5）で勝つ
 * 相手のライフは 5（ふつうは 20。対戦の終わりぎわから始める）
 */
export const TUTORIAL = {
  /** 自分（p1）と相手（p2。CPU） */
  me: "p1" satisfies PlayerId,
  foe: "p2" satisfies PlayerId,
  /** 次の自分のターンに引いて出すキャラクター（切り抜き職人 1/1 速攻・コスト 1） */
  character: "f1",
  /** 使う呪文（トレンド入り：相手のキャラクター1体に3ダメージ・コスト 3） */
  spell: "n10",
  /** 闇堕ちを持つカード（レン 2/4。闇堕ちレン 4/2 速攻）。始めは場にいて、相打ちで裏向きのカードになる */
  ace: "c2",
  /** レンが相打ちにする相手（古参 4/4。前に 2 ダメージを受けている） */
  rival: "n5",
  rivalDamage: 2,
  /** 相手のターンに出てくるガード（有識者ニキ 1/3） */
  guard: "g2",
  /** レン（のちの裏向きのカード）の枠・古参の枠・相手のガードの枠 */
  omenSlot: 1,
  rivalSlot: 1,
  guardSlot: 2,
  /** 始まりのライフ（ふつうの始まりは DEFAULT_CONFIG.startLp） */
  myLp: 11,
  foeLp: 5,
  /** 始まりのターン（自分の 3 ターン目）と、闇堕ちさせるターン（自分の 4 ターン目） */
  turn: 5,
  finalTurn: 7,
  /** 闇堕ちさせるターンのコスト */
  mana: 4,
} as const;

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

const emptyField = () => Array.from({ length: SLOTS }, (): Unit | null => null);

/** チュートリアルの盤面（いつも同じ。山札の 1 枚目は次のターンに引く切り抜き職人。ほかの山札・相手の手札は見た目のためだけ） */
export function createTutorialGame(): GameState {
  const t = TUTORIAL;
  const foeField = emptyField();
  foeField[t.rivalSlot] = { ...unit(1, t.rival), damage: t.rivalDamage };
  const myField = emptyField();
  myField[t.omenSlot] = unit(2, t.ace);
  return {
    turn: t.turn,
    active: t.me,
    winner: null,
    seed: 1,
    nextUid: 3,
    pending: null,
    players: {
      p1: {
        lp: t.myLp,
        // このターンのコストは使い切っている（レンで攻撃するだけ）
        mana: 0,
        maxMana: t.mana - 1,
        deck: [t.character, "f6", "n6", "f3", "n3", "f12", "f2", "n2", "f13", "c9", "f16", "n5"],
        hand: [t.spell],
        field: myField,
        trash: ["f12", "f6"],
        playedThisTurn: 0,
        postsUsed: 1,
        heals: 0,
        extraTurns: 0,
        breakthroughTurn: 0,
        darkSpent: [],
        darkOmens: [],
        buzzLeft: DEFAULT_CONFIG.buzzCount,
        buzzFrom: DEFAULT_CONFIG.buzzFrom,
        turnsTaken: 3,
      },
      p2: {
        lp: t.foeLp,
        mana: 0,
        maxMana: 2,
        deck: ["g1", "g10", "g9", "g12", "g7", "n6", "g13", "g3", "n9", "c7", "n15"],
        hand: ["g17", t.guard, "g20"],
        field: foeField,
        trash: ["g10", "g9", "n3"],
        playedThisTurn: 0,
        postsUsed: 1,
        heals: 0,
        extraTurns: 0,
        breakthroughTurn: 0,
        darkSpent: [],
        darkOmens: [],
        buzzLeft: DEFAULT_CONFIG.buzzCount,
        buzzFrom: DEFAULT_CONFIG.buzzFrom - 1,
        turnsTaken: 2,
      },
    },
  };
}

/** 相手のターンの手：ガードを決めた枠に出して、ターンを終える（CPU は考えない） */
export function tutorialFoeTurn(state: GameState): Action[] {
  const t = TUTORIAL;
  const handIndex = state.players[t.foe].hand.indexOf(t.guard);
  return [
    ...(handIndex >= 0 ? [{ type: "play", player: t.foe, handIndex, slot: t.guardSlot } as const] : []),
    { type: "endTurn", player: t.foe },
  ];
}
