import { DEFAULT_CONFIG, type GameState, type PlayerId, SLOTS, type Unit } from "./types";

/**
 * チュートリアルの対戦（10月27日。オーナー：「基本のキャラ出し、呪文出し、闇堕ち、プレイヤー殴りで残り5体力とかを削って勝ち」）。
 * 自分の 4 ターン目（コスト 4）から始まる 1 ターンだけの盤面。相手のライフは 5、相手の場にはガード 1 体、
 * 自分の場には前のターンに破壊されたレンの裏向きのカード、手札は速攻のキャラクターと 3 ダメージの呪文。
 * キャラクターを出す → 呪文でガードを破壊する → 闇堕ちさせる → 2 体でプレイヤーを攻撃する（4 + 1 = 5）で勝つ。
 * 相手のターンは来ない（画面がターン終了を押させない）
 */
export const TUTORIAL = {
  /** 自分（p1）と相手（p2。CPU） */
  me: "p1" satisfies PlayerId,
  foe: "p2" satisfies PlayerId,
  /** 手札から出すキャラクター（切り抜き職人 1/1 速攻・コスト 1） */
  character: "f1",
  /** 使う呪文（トレンド入り：相手のキャラクター1体に3ダメージ・コスト 3） */
  spell: "n10",
  /** 裏向きのカードで残っている闇堕ちを持つカード（レン。闇堕ちレン 4/2 速攻） */
  ace: "c2",
  /** 相手の場のガード（有識者ニキ 1/3） */
  guard: "g2",
  /** 裏向きのカードの枠・相手のガードの枠 */
  omenSlot: 1,
  guardSlot: 2,
  /** 始まりのライフ */
  myLp: 11,
  foeLp: 5,
  turn: 7,
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

/** チュートリアルの盤面（いつも同じ。山札・相手の手札は見た目のためだけ） */
export function createTutorialGame(): GameState {
  const t = TUTORIAL;
  const foeField = emptyField();
  foeField[t.guardSlot] = unit(1, t.guard);
  return {
    turn: t.turn,
    active: t.me,
    winner: null,
    seed: 1,
    nextUid: 2,
    pending: null,
    players: {
      p1: {
        lp: t.myLp,
        mana: t.mana,
        maxMana: t.mana,
        deck: ["f6", "n6", "f3", "n3", "f12", "f2", "n2", "f13", "c9", "f16", "n5", "f22"],
        hand: [t.character, t.spell],
        field: emptyField(),
        // レンは前の相手のターンに破壊され、墓地に行って枠に裏向きで残っている
        trash: ["f12", "f6", t.ace],
        playedThisTurn: 0,
        postsUsed: 1,
        heals: 0,
        extraTurns: 0,
        breakthroughTurn: 0,
        darkSpent: [],
        darkOmens: [{ cardId: t.ace, slot: t.omenSlot, turn: t.turn - 1 }],
        buzzLeft: DEFAULT_CONFIG.buzzCount,
        buzzFrom: DEFAULT_CONFIG.buzzFrom,
        turnsTaken: 4,
      },
      p2: {
        lp: t.foeLp,
        mana: 0,
        maxMana: 3,
        deck: ["g1", "g10", "g9", "g12", "g7", "n6", "g13", "g3", "n9", "c7", "n15"],
        hand: ["g17", "g20", "n11"],
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
        turnsTaken: 3,
      },
    },
  };
}
