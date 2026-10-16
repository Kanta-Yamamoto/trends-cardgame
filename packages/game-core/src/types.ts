/** ルールが必要とするカード情報だけ（表示用の情報は持たない） */
export interface RuleCard {
  id: string;
  cost: number;
  power: number;
  tribe: string;
  keywords?: readonly string[];
}

export type PlayerId = "p1" | "p2";
export const SLOTS = 3;

export interface Unit {
  /** 場に出るたびに振られる一意な番号 */
  uid: number;
  cardId: string;
  canAttack: boolean;
}

export interface PlayerState {
  lp: number;
  /** 今使える話題力 */
  mana: number;
  /** 話題力の上限（ターンごとに1増える） */
  maxMana: number;
  deck: string[];
  hand: string[];
  field: (Unit | null)[];
  trash: string[];
}

export interface GameState {
  /** 通算ターン数（両者合計、1から） */
  turn: number;
  active: PlayerId;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
  seed: number;
  nextUid: number;
}

export type AttackTarget = { kind: "leader" } | { kind: "unit"; slot: number };

export type Action =
  | { type: "play"; player: PlayerId; handIndex: number; slot: number }
  | { type: "attack"; player: PlayerId; from: number; target: AttackTarget }
  | { type: "endTurn"; player: PlayerId };

/** 画面側が演出を付けるための出来事の記録 */
export type GameEvent =
  | { type: "played"; player: PlayerId; cardId: string; slot: number; cost: number }
  | { type: "searched"; player: PlayerId; looked: string[]; added: string | null }
  | { type: "battle"; attacker: string; defender: string; destroyed: string[] }
  | { type: "leaderDamaged"; player: PlayerId; amount: number; lp: number }
  | { type: "leaderHealed"; player: PlayerId; amount: number; lp: number }
  | { type: "discarded"; player: PlayerId; cardId: string }
  | { type: "drew"; player: PlayerId; cardId: string }
  | { type: "deckOut"; player: PlayerId }
  | { type: "turnStarted"; player: PlayerId; turn: number; mana: number }
  | { type: "won"; player: PlayerId };

export interface Config {
  maxMana: number;
  startLp: number;
  startHand: number;
  /** 後攻が追加で持つ枚数 */
  secondExtra: number;
  /** 後攻の最初のターンだけ追加される話題力 */
  secondBonusMana: number;
}
export const DEFAULT_CONFIG: Config = {
  maxMana: 10,
  startLp: 20000,
  startHand: 4,
  secondExtra: 1,
  secondBonusMana: 1,
};

export class RuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
