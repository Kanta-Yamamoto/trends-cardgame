/** 属性：その話題に人がどう反応したか */
export type Attribute = "炎上" | "メロい" | "癒し" | "草" | "神";
/** 界隈：そのカードが何者か（いわゆる種族） */
export type Kaiwai = "ミーム" | "アイドル" | "配信者" | "有識者" | "動物";
export type Keyword = "ガード" | "速攻" | "連撃" | "叩き" | "注目";
/** アイコン：場に出て戦う／投稿：使い切りの効果 */
export type CardType = "icon" | "post";
/** ★1〜★5（★5 が最高） */
export type Rarity = 1 | 2 | 3 | 4 | 5;
/** 投稿の対象 */
export type PostTarget = "enemyIcon" | "allyIcon";

/**
 * カードの効果（データで表す）。
 * アイコンは on（play＝場に出たとき／passive＝場にいる間）、投稿は使ったときに上から順に実行する。
 */
export type CardEffect = (
  | { on?: "play"; do: "summon"; card: string; count: number }
  | { on?: "play"; do: "copySelf" }
  | { on?: "play"; do: "buffSelf"; attack: number; hp: number }
  | { on?: "play"; do: "buffSelfPerPlayed"; attack: number }
  | { on?: "play"; do: "buffRandomAlly"; attack: number; hp: number }
  /** 自分の場のほかのアイコンすべて */
  | { on?: "play"; do: "buffAllies"; attack: number; hp: number }
  | { on?: "play"; do: "heal"; to: "master" | "allAlliesAndMaster" | "allAlliesFull"; amount?: number }
  | { on?: "play"; do: "draw"; count: number; ifHandAtMost?: number }
  | { on?: "play"; do: "removeEnemyGuards" }
  /** to が無ければ投稿の対象に */
  | { on?: "play"; do: "damage"; to?: "strongestEnemy" | "allEnemies" | "enemyMaster"; amount: number }
  | { on?: "passive"; do: "attackPerAlly" }
  | { do: "expose" }
  /** to が無ければ投稿の対象を眠らせる */
  | { on?: "play"; do: "bind"; to?: "strongestEnemy" | "allEnemies" }
  | { do: "silence" }
  | { do: "weaken"; attack: number }
  | { do: "buff"; attack: number; hp: number }
  | { do: "fill"; card: string }
  | { do: "cleanse" }
) & {
  /** 条件：自分の場（このアイコンを含む）に、その属性のアイコンが atLeast 体以上いるときだけ */
  if?: { allies: Attribute; atLeast: number };
};

/** 闇堕ちの姿（一度倒されたときに裏返る） */
export interface DarkSide {
  name: string;
  attack: number;
  hp: number;
  keywords: Keyword[];
  effect: string;
}

/** カード1枚の定義。ゲームのルールと表示の両方がここを参照する */
export interface CardDef {
  id: string;
  name: string;
  /** 肩書き（名前の上に小さく出す）。無ければ空文字 */
  epithet: string;
  type: CardType;
  rarity: Rarity;
  cost: number;
  /** アイコンだけが持つ */
  attack?: number;
  hp?: number;
  /** 0〜2個。0個は共通カード（どのデッキにも入れられる） */
  attributes: Attribute[];
  /** 0〜2個 */
  kaiwai: Kaiwai[];
  keywords: Keyword[];
  effects: CardEffect[];
  /** 投稿の対象 */
  target?: PostTarget;
  /** カードに書く効果文 */
  effect: string;
  flavor: string;
  dark?: DarkSide;
  /** 効果で生まれるだけのカード（デッキには入れられない） */
  token?: boolean;
  number?: string | null;
  serial?: string;
  /** web の public からのパス。イラストがまだないカードは持たない */
  art?: string;
  subject?: string;
  /** 印刷用の元画像（リポジトリ直下からのパス） */
  original?: string;
}

export const ATTRIBUTES: readonly Attribute[] = ["炎上", "メロい", "癒し", "草", "神"];
export const KAIWAI: readonly Kaiwai[] = ["ミーム", "アイドル", "配信者", "有識者", "動物"];
export const DECK_SIZE = 25;
/** 1つのデッキに入れられる属性の数（共通カードは数えない） */
export const MAX_DECK_ATTRIBUTES = 2;
export const MAX_COPIES = 3;
