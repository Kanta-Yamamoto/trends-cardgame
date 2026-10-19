import type { CardDef, Keyword } from "@trends/cards";

/** ルールが必要とするカード情報（表示用の情報は使わない） */
export type RuleCard = Pick<
  CardDef,
  | "id"
  | "type"
  | "cost"
  | "attack"
  | "hp"
  | "keywords"
  | "effects"
  | "target"
  | "dark"
  | "token"
  | "retired"
  | "kaiwai"
  | "targetKaiwai"
  | "targetFilter"
  | "attributes"
  | "rarity"
>;

export type PlayerId = "p1" | "p2";
export const SLOTS = 5;
/** 真ん中の枠（注目が多くたまる） */
export const CENTER_SLOT = 2;

/** 場に出ているアイコン */
export interface Unit {
  /** 場に出るたびに振られる一意な番号 */
  uid: number;
  cardId: string;
  /** 受けたダメージ（ターンをまたいで残る） */
  damage: number;
  /** このターンに攻撃できる状態か（出したターンは false。速攻なら true） */
  canAttack: boolean;
  /** このターンに残っている攻撃回数（連撃は2） */
  attacksLeft: number;
  /** 効果で増減した攻撃力・体力 */
  atkBuff: number;
  hpBuff: number;
  /** 闇堕ちの姿になっているか／一度闇堕ちしたか */
  dark: boolean;
  darkUsed: boolean;
  /** 晒し者（ガードを失い、晒された時点で強化が消えた。ずっと続く。TL浄化で消える） */
  exposed: boolean;
  /** 自分のターンの終わりに晒し者になる（炎上商法） */
  exposeAtTurnEnd?: boolean;
  /** このターン数までは眠っていて攻撃できない */
  boundUntil: number;
  /** キーワードと効果が消されている（コミュニティノート） */
  silenced: boolean;
  /** ガードだけ消されている */
  noGuard: boolean;
  /** トークン（オワコンに行くと消える） */
  token: boolean;
  /** このターンは相手のアイコンにだけ攻撃できる（凸・闇堕ちした直後） */
  rushOnly?: boolean;
  /** このターンだけの攻撃力の強化（ターンの終わりに消える） */
  tempAtk?: number;
}

/** マスター（操作するプレイヤー）の状態 */
export interface PlayerState {
  /** ライフ。0 になったら負け */
  lp: number;
  /** 今使える話題力 */
  mana: number;
  /** 話題力の上限（ターンごとに1増える） */
  maxMana: number;
  deck: string[];
  hand: string[];
  field: (Unit | null)[];
  /** オワコン（倒されたアイコンや使った投稿が行く場所） */
  trash: string[];
  /** このターンに出した・使ったカードの枚数 */
  playedThisTurn: number;
  /** このゲームで使った投稿の枚数 */
  postsUsed: number;
  /** このゲームで回復の効果を使った回数（癒しの「回復するたびに」で使う） */
  heals: number;
  /** このゲームで、自分のトークンがオワコンに行った数（カード ID ごと。クサハミで使う） */
  tokensLost?: Record<string, number>;
  /** このターンのあとに続けて行うターンの数 */
  extraTurns: number;
  /** このターン数の間、自分のアイコンはガードを無視して攻撃できる */
  breakthroughTurn: number;
  /** 闇堕ちを使い終えたカード（闇堕ちの姿で倒されて、オワコンに戻ったもの）。同じカードの闇堕ちは1枚につき1回 */
  darkSpent: string[];
  /** このゲームで闇堕ちした回数（DARK_FALLS_PER_GAME まで） */
  darkFalls?: number;
  /** この通算ターンまで、マスターはダメージを受けない（0 なら守られていない） */
  shieldUntil?: number;
}

export interface GameState {
  /** 通算ターン数（両者合計、1から） */
  turn: number;
  active: PlayerId;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
  seed: number;
  nextUid: number;
  /**
   * 差し出し待ち（フィクサー）：waiting のプレイヤーが、自分のアイコンを1体選ぶまで、ほかの操作はできない。
   * 選ばれたアイコンは picks に入り、全員が選び終えたら一度に倒される
   */
  pending?: {
    kind: "sacrifice";
    /** 効果を出したプレイヤー（この人の手番の途中） */
    source: PlayerId;
    /** 効果を出したアイコン（自分の差し出しには選べない） */
    sourceUid: number;
    waiting: PlayerId[];
    picks: Partial<Record<PlayerId, number>>;
  } | null;
}

export type AttackTarget = { kind: "leader" } | { kind: "unit"; slot: number };
/** 投稿の対象（相手のアイコンか、自分のアイコン） */
export type CastTarget = { side: "enemy" | "ally"; slot: number };

export type Action =
  | { type: "play"; player: PlayerId; handIndex: number; slot: number }
  | { type: "cast"; player: PlayerId; handIndex: number; target?: CastTarget }
  | { type: "attack"; player: PlayerId; from: number; target: AttackTarget }
  /** オワコンにある闇堕ちを持つカードを、闇堕ちの姿で出す（コストなし・1試合に1回） */
  | { type: "darkFall"; player: PlayerId; cardId: string; slot: number }
  | { type: "endTurn"; player: PlayerId }
  /** 差し出し（フィクサー）：自分のアイコンを1体選ぶ。相手の手番の途中でも、選ぶ番の人が行う */
  | { type: "sacrifice"; player: PlayerId; slot: number }
  /** 降参（相手の勝ちになる。自分のターンでなくてもできる） */
  | { type: "resign"; player: PlayerId };

/** 画面側が演出を付けるための出来事の記録 */
export type GameEvent =
  | { type: "played"; player: PlayerId; cardId: string; slot: number; cost: number }
  | { type: "cast"; player: PlayerId; cardId: string; cost: number; target?: CastTarget }
  | { type: "summoned"; player: PlayerId; cardId: string; slot: number }
  /** 蘇生：オワコンから場に戻った */
  | { type: "revived"; player: PlayerId; cardId: string; slot: number }
  /** 変身：そのアイコンが別のカード（トークン）になった */
  | { type: "transformed"; player: PlayerId; slot: number; cardId: string; into: string }
  | {
      type: "battle";
      attacker: string;
      defender: string;
      /** 守る側が受けたダメージ */
      toDefender: number;
      /** 攻撃側が受けた反撃のダメージ */
      toAttacker: number;
      destroyed: string[];
    }
  | { type: "damaged"; player: PlayerId; slot: number; cardId: string; amount: number }
  | { type: "destroyed"; player: PlayerId; cardId: string }
  | { type: "darkFall"; player: PlayerId; slot: number; cardId: string }
  | { type: "restored"; player: PlayerId; slot: number; cardId: string }
  | {
      type: "status";
      player: PlayerId;
      slot: number;
      cardId: string;
      status: "晒し" | "眠り" | "訂正" | "ガード消滅";
    }
  | { type: "stolen"; player: PlayerId; from: number; slot: number; cardId: string }
  /** 場のアイコンが持ち主の手札に戻った（player は持ち主） */
  | { type: "bounced"; player: PlayerId; slot: number; cardId: string }
  /** マスターが守られた（shielded：守りを得た／blocked：ダメージを防いだ） */
  | { type: "shield"; player: PlayerId; kind: "shielded" | "blocked"; amount: number }
  | { type: "extraTurn"; player: PlayerId }
  | { type: "buffed"; player: PlayerId; slot: number; cardId: string; attack: number; hp: number }
  | { type: "healed"; player: PlayerId; slot: number; cardId: string; amount: number }
  | { type: "leaderDamaged"; player: PlayerId; amount: number; lp: number }
  | { type: "leaderHealed"; player: PlayerId; amount: number; lp: number }
  | { type: "drew"; player: PlayerId; cardId: string }
  | { type: "deckOut"; player: PlayerId }
  /** フィールド「サウナ」：熱（ターンの始めに全員へダメージ）と回復（ターンの終わりに全員を回復）。player はフィールドの持ち主 */
  | { type: "sauna"; player: PlayerId; phase: "heat" | "heal"; amount: number }
  /** 差し出し待ちが始まった（waiting の人が自分のアイコンを1体選ぶ） */
  | { type: "sacrificeAsk"; player: PlayerId; waiting: PlayerId[] }
  /** 差し出し：選ばれたアイコンが倒された（player はそのアイコンの持ち主） */
  | { type: "sacrificed"; player: PlayerId; slot: number; cardId: string }
  /** 特殊勝利（陰謀論者：山札が0枚で自分のターンを始めた） */
  | { type: "specialWin"; player: PlayerId; cardId: string }
  /** 手札が上限で、引いたカードがオワコンへ行った */
  | { type: "burned"; player: PlayerId; cardId: string }
  | { type: "resigned"; player: PlayerId }
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
/** 手札の上限。上限のときに引いたカードはオワコンへ */
export const MAX_HAND = 9;
export const DEFAULT_CONFIG: Config = {
  maxMana: 10,
  startLp: 20,
  startHand: 3,
  secondExtra: 1,
  secondBonusMana: 1,
};

/** 画面や CPU が使う、アイコンの今の姿 */
export interface UnitView {
  unit: Unit;
  name?: string;
  attack: number;
  hp: number;
  maxHp: number;
  keywords: Keyword[];
  guard: boolean;
  exposed: boolean;
  asleep: boolean;
}

export class RuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
