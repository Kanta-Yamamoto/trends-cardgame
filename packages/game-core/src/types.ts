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

/** 場に出ているキャラクター */
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
  /** 晒し状態（ガードを失い、晒された時点で強化が消えた。ずっと続く。TL浄化で消える） */
  exposed: boolean;
  /** 自分のターンの終わりに晒し状態になる（炎上商法） */
  exposeAtTurnEnd?: boolean;
  /** このターン数までは眠っていて攻撃できない */
  boundUntil: number;
  /** キーワードと効果が消されている（コミュニティノート） */
  silenced: boolean;
  /** ガードだけ消されている */
  noGuard: boolean;
  /** 効果でガードを得ている（リスナー） */
  gainedGuard?: boolean;
  /** トークン（効果で生まれたカード。デッキには入れられないが、ほかはふつうのカードと同じ） */
  token: boolean;
  /** このターンは相手のキャラクターにだけ攻撃できる（突進・闇堕ちした直後） */
  rushOnly?: boolean;
  /** このターンだけの攻撃力の強化（ターンの終わりに消える） */
  tempAtk?: number;
}

/** プレイヤー（操作するプレイヤー）の状態 */
export interface PlayerState {
  /** ライフ。0 になったら負け */
  lp: number;
  /** 今使えるコスト */
  mana: number;
  /** コストの上限（ターンごとに1増える） */
  maxMana: number;
  deck: string[];
  hand: string[];
  field: (Unit | null)[];
  /** 墓地（破壊されたキャラクターや使った呪文が行く場所） */
  trash: string[];
  /** このターンに出した・使ったカードの枚数 */
  playedThisTurn: number;
  /** このゲームで使った呪文の枚数 */
  postsUsed: number;
  /** このゲームで回復の効果を使った回数（癒しの「回復するたびに」で使う） */
  heals: number;
  /** このゲームで、自分のトークンが破壊された数（カード ID ごと。クサハミで使う） */
  tokensLost?: Record<string, number>;
  /** このターンのあとに続けて行うターンの数 */
  extraTurns: number;
  /** このターン数の間、自分のキャラクターはガードを無視して攻撃できる */
  breakthroughTurn: number;
  /** 闇堕ちを使い終えたカード（闇堕ちの姿のまま手札に戻されたもの）。次にそのカードが破壊されても闇堕ちしない */
  darkSpent: string[];
  /**
   * 闇の気配：破壊された闇堕ちを持つカード。次の自分のターンの始めに、闇堕ちの姿で場に出る
   * （slot は破壊された枠。埋まっていればほかの空き枠へ。空きがなければ待つ）
   */
  darkOmens?: { cardId: string; slot: number }[];
  /** バズの残り回数 */
  buzzLeft?: number;
  /** バズを最後に使った通算ターン（1ターンに1回まで） */
  buzzTurn?: number;
  /** 自分のターンを始めた回数（バズを使える時期に使う） */
  turnsTaken?: number;
  /** バズを使えるのは、自分のこのターン目から（後攻は先攻より1ターン早い） */
  buzzFrom?: number;
  /** この通算ターンまで、プレイヤーはダメージを受けない（0 なら守られていない） */
  shieldUntil?: number;
  /** この通算ターンまで、プレイヤーが受けるダメージを1回ごとに cutAmount 減らす（盾） */
  cutUntil?: number;
  cutAmount?: number;
  /** 手札のカード（ID ごと）のコストを下げる分（雑学博士）。そのカードを出す・使うと消える */
  handDiscount?: Record<string, number>;
  /** このゲームで自分が出したガードのキャラクターの数（ネ申のコスト） */
  guardsPlayed?: number;
  /** このゲームで自分が手札から出したキャラクターの数（カード ID ごと。伝説のコラ画像） */
  played?: Record<string, number>;
  /**
   * このプレイヤーに付与された「次の自分のターンの終わりに amount ダメージを受ける」効果（ミコト）。
   * turn は付与された通算ターン（そのターンのうちには働かない）。働いたら消える
   */
  delayedDamage?: { cardId: string; amount: number; turn: number }[];
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
   * 差し出し待ち（フィクサー）：waiting のプレイヤーが、自分のキャラクターを1体選ぶまで、ほかの操作はできない。
   * 選ばれたキャラクターは picks に入り、全員が選び終えたら一度に破壊される
   */
  pending?: {
    kind: "sacrifice";
    /** 効果を出したプレイヤー（この人の手番の途中） */
    source: PlayerId;
    /** 効果を出したキャラクター（自分の差し出しには選べない） */
    sourceUid: number;
    waiting: PlayerId[];
    picks: Partial<Record<PlayerId, number>>;
  } | null;
}

export type AttackTarget = { kind: "leader" } | { kind: "unit"; slot: number };
/** 呪文の対象（相手のキャラクターか、自分のキャラクター） */
export type CastTarget = { side: "enemy" | "ally"; slot: number };

export type Action =
  | { type: "play"; player: PlayerId; handIndex: number; slot: number }
  | { type: "cast"; player: PlayerId; handIndex: number; target?: CastTarget }
  | { type: "attack"; player: PlayerId; from: number; target: AttackTarget }
  /** バズ：自分のキャラクター1体に攻撃力+2・体力+2と突進（1試合に2回・1ターンに1回） */
  | { type: "buzz"; player: PlayerId; slot: number }
  | { type: "endTurn"; player: PlayerId }
  /** 差し出し（フィクサー）：自分のキャラクターを1体選ぶ。相手の手番の途中でも、選ぶ番の人が行う */
  | { type: "sacrifice"; player: PlayerId; slot: number }
  /** 降参（相手の勝ちになる。自分のターンでなくてもできる） */
  | { type: "resign"; player: PlayerId }
  /** 時間切れ（オンライン対戦で、持ち時間を使い切った。サーバーだけが行う。相手の勝ちになる） */
  | { type: "timeout"; player: PlayerId };

/** 画面側が演出を付けるための出来事の記録 */
export type GameEvent =
  | { type: "played"; player: PlayerId; cardId: string; slot: number; cost: number }
  | { type: "cast"; player: PlayerId; cardId: string; cost: number; target?: CastTarget }
  | { type: "summoned"; player: PlayerId; cardId: string; slot: number }
  /** 蘇生：墓地から場に戻った */
  | { type: "revived"; player: PlayerId; cardId: string; slot: number }
  /** 変身：そのキャラクターが別のカード（トークン）になった */
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
  /** 破壊された。slot はいた枠。vanished は闇堕ちの姿が破壊されて消えた（墓地に行かない） */
  | { type: "destroyed"; player: PlayerId; cardId: string; slot: number; vanished?: boolean }
  /** 闇の気配：闇堕ちを持つカードが破壊され、次の自分のターンの始めに闇堕ちして戻ってくる */
  | { type: "darkOmen"; player: PlayerId; slot: number; cardId: string }
  | { type: "darkFall"; player: PlayerId; slot: number; cardId: string }
  /** バズ：そのキャラクターに攻撃力+2・体力+2と突進 */
  | { type: "buzz"; player: PlayerId; slot: number; cardId: string; attack: number; hp: number; left: number }
  | { type: "restored"; player: PlayerId; slot: number; cardId: string }
  | {
      type: "status";
      player: PlayerId;
      slot: number;
      cardId: string;
      status: "晒し" | "眠り" | "沈黙" | "ガード消滅";
    }
  | { type: "stolen"; player: PlayerId; from: number; slot: number; cardId: string }
  /** 場のキャラクターが持ち主の手札に戻った（player は持ち主） */
  | { type: "bounced"; player: PlayerId; slot: number; cardId: string }
  /** プレイヤーが守られた（shielded：守りを得た／blocked：ダメージを防いだ） */
  | { type: "shield"; player: PlayerId; kind: "shielded" | "blocked"; amount: number }
  /** プレイヤーに「次の自分のターンの終わりに amount ダメージを受ける」効果が付いた（player は付けられた人） */
  | { type: "delayedDamageSet"; player: PlayerId; cardId: string; amount: number }
  /** 付いていた効果が働いた（player は付けられた人。このあとプレイヤーへのダメージが続く） */
  | { type: "delayedDamageFired"; player: PlayerId; cardId: string; amount: number }
  | { type: "extraTurn"; player: PlayerId }
  | { type: "buffed"; player: PlayerId; slot: number; cardId: string; attack: number; hp: number }
  | { type: "healed"; player: PlayerId; slot: number; cardId: string; amount: number }
  | { type: "leaderDamaged"; player: PlayerId; amount: number; lp: number }
  | { type: "leaderHealed"; player: PlayerId; amount: number; lp: number }
  | { type: "drew"; player: PlayerId; cardId: string }
  | { type: "deckOut"; player: PlayerId }
  /** 差し出し待ちが始まった（waiting の人が自分のキャラクターを1体選ぶ） */
  | { type: "sacrificeAsk"; player: PlayerId; waiting: PlayerId[] }
  /** 差し出し：選ばれたキャラクターが破壊された（player はそのキャラクターの持ち主） */
  | { type: "sacrificed"; player: PlayerId; slot: number; cardId: string }
  /** 特殊勝利（陰謀論者：山札が0枚で自分のターンを始めた） */
  | { type: "specialWin"; player: PlayerId; cardId: string }
  /** 手札が上限で、引いたカードが墓地へ行った */
  | { type: "burned"; player: PlayerId; cardId: string }
  | { type: "resigned"; player: PlayerId }
  | { type: "timedOut"; player: PlayerId }
  | { type: "turnStarted"; player: PlayerId; turn: number; mana: number }
  | { type: "won"; player: PlayerId };

export interface Config {
  maxMana: number;
  startLp: number;
  startHand: number;
  /** 後攻が追加で持つ枚数 */
  secondExtra: number;
  /** 後攻の最初のターンだけ追加されるコスト */
  secondBonusMana: number;
  /** バズの回数（1試合に） */
  buzzCount: number;
  /** バズを使えるのは、自分のこのターン目から（後攻は1ターン早い） */
  buzzFrom: number;
  /** バズで上がる攻撃力・体力 */
  buzzAttack: number;
  buzzHp: number;
}
/** 手札の上限。上限のときに引いたカードは墓地へ */
export const MAX_HAND = 9;
export const DEFAULT_CONFIG: Config = {
  maxMana: 10,
  startLp: 20,
  startHand: 3,
  secondExtra: 1,
  secondBonusMana: 1,
  buzzCount: 2,
  buzzFrom: 4,
  buzzAttack: 2,
  buzzHp: 2,
};

/** 画面や CPU が使う、キャラクターの今の姿 */
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
