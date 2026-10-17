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
 * 効果が働くとき。
 * play＝場に出たとき（投稿は使ったとき。省略時）／passive＝場にいる間ずっと／
 * turnEnd＝自分のターンの終わり／hand＝手札にある間（コストの補正）
 */
export type EffectTrigger = "play" | "passive" | "turnEnd" | "hand";

/** カードの効果（データで表す）。on ごとに、上から順に実行する */
export type CardEffect = (
  | { do: "summon"; card: string; count: number }
  | { do: "copySelf" }
  | { do: "buffSelf"; attack: number; hp: number }
  | { do: "buffSelfPerPlayed"; attack: number }
  | { do: "buffRandomAlly"; attack: number; hp: number }
  /** 自分の場のほかのアイコンすべて */
  | { do: "buffAllies"; attack: number; hp: number }
  | { do: "heal"; to: "master" | "allAlliesAndMaster" | "allAlliesFull"; amount?: number }
  | { do: "draw"; count: number; ifHandAtMost?: number }
  | { do: "removeEnemyGuards" }
  /** to が無ければ投稿の対象に */
  | { do: "damage"; to?: "strongestEnemy" | "allEnemies" | "enemyMaster"; amount: number }
  /** passive：自分の場のほかのアイコン1体につき攻撃力+1 */
  | { do: "attackPerAlly" }
  /** 晒し者にする（強化が消え、ガードを無視して攻撃される）。to が無ければ投稿の対象を */
  | { do: "expose"; to?: "strongestEnemy" | "allEnemies" }
  /** to が無ければ投稿の対象を眠らせる */
  | { do: "bind"; to?: "strongestEnemy" | "allEnemies" }
  /** to が無ければ投稿の対象を訂正する */
  | { do: "silence"; to?: "strongestEnemy" }
  | { do: "weaken"; attack: number }
  | { do: "buff"; attack: number; hp: number }
  | { do: "fill"; card: string }
  | { do: "cleanse" }
  /** 攻撃力 maxAttack 以下の相手のアイコンのうち、いちばん強い1体を自分の場に奪う */
  | { do: "steal"; maxAttack: number }
  /** このターンのあとに、もう一度自分のターンを行う */
  | { do: "extraTurn" }
  /** 自分のアイコンすべてがすぐ攻撃できるようになり、ほかのアイコンの攻撃力 +attack */
  | { do: "rally"; attack: number }
  /** このターン、自分のアイコンはガードを無視して攻撃できる */
  | { do: "breakthrough" }
  /** 自分の場のアイコン1体につき、相手のマスターに amount ダメージ */
  | { do: "burnPerAlly"; amount: number }
  /** 体力が maxHp 以下の相手のアイコンをすべて倒す */
  | { do: "sweep"; maxHp: number }
  /** passive：相手のアイコンを倒すたび、もう1回攻撃できる */
  | { do: "extraAttackOnKill" }
  /** passive：センターにいる間、自分のほかのアイコンも注目と同じく伸びる */
  | { do: "focusAura" }
  /** passive：相手のターンの始めに、相手の攻撃力がいちばん高いアイコンを眠らせる */
  | { do: "lullaby" }
  /** hand：自分の場のアイコン1体につきコスト-1 */
  | { do: "cheaperPerAlly" }
  /** hand：このゲームで自分が使った投稿1枚につきコスト-1 */
  | { do: "cheaperPerPost" }
) & {
  on?: EffectTrigger;
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
  /** 闇堕ちの姿の絵（web の public からのパス）。無ければ元の絵 */
  art?: string;
  subject?: string;
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
