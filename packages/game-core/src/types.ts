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
  mana: number;
  deck: string[];
  hand: string[];
  field: (Unit | null)[];
  trash: string[];
}

export interface GameState {
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
  | { type: "discarded"; player: PlayerId; cardId: string }
  | { type: "drew"; player: PlayerId; cardId: string }
  | { type: "turnStarted"; player: PlayerId; turn: number }
  | { type: "won"; player: PlayerId };

export interface Config {
  maxMana: number;
  startLp: number;
  startHand: number;
}
export const DEFAULT_CONFIG: Config = { maxMana: 12, startLp: 20000, startHand: 3 };

export class RuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
