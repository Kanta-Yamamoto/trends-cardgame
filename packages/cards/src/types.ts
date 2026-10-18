/** 属性：その話題に人がどう反応したか */
export type Attribute = "炎上" | "メロい" | "癒し" | "草" | "神";
/** 界隈：そのカードが何者か（いわゆる種族）。属性をまたいで付け、場で手を組む相手を決める軸。2界隈は★3以上の少数だけ */
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
  /** 自分のほかのアイコンすべてに。kaiwai を付けると、その界隈だけ */
  | { do: "buffAllies"; attack: number; hp: number; kaiwai?: Kaiwai }
  | { do: "heal"; to: "master" | "allAlliesAndMaster" | "allAlliesFull"; amount?: number }
  | { do: "draw"; count: number; ifHandAtMost?: number }
  | { do: "removeEnemyGuards" }
  /** to が無ければ投稿の対象に */
  | { do: "damage"; to?: "strongestEnemy" | "allEnemies" | "enemyMaster"; amount: number }
  /** passive：自分の場のほかのアイコン1体につき攻撃力+1 */
  /** 自分の場のほかのアイコン1体につき攻撃力+1。kaiwai を付けると、その界隈だけ数える */
  | { do: "attackPerAlly"; kaiwai?: Kaiwai }
  /** 晒し者にする（強化が消え、ガードを無視して攻撃される）。to が無ければ投稿の対象を */
  | { do: "expose"; to?: "strongestEnemy" | "allEnemies" }
  /** to が無ければ投稿の対象を眠らせる */
  | { do: "bind"; to?: "strongestEnemy" | "allEnemies" }
  /** to が無ければ投稿の対象を訂正する */
  | { do: "silence"; to?: "strongestEnemy" }
  /** 攻撃力を下げる。to が無ければ投稿の対象、allEnemies なら相手のアイコンすべて */
  | { do: "weaken"; attack: number; to?: "allEnemies" }
  | { do: "buff"; attack: number; hp: number }
  | { do: "fill"; card: string }
  | { do: "cleanse" }
  /** 攻撃力 maxAttack 以下の相手のアイコンのうち、いちばん強い1体を自分の場に奪う */
  /** 攻撃力 maxAttack 以下の相手のアイコンを奪う（いちばん強いもの。投稿の対象があればそれ） */
  | { do: "steal"; maxAttack: number }
  /** このターンのあとに、もう一度自分のターンを行う */
  | { do: "extraTurn" }
  /** 自分のアイコンすべてがすぐ攻撃できるようになり、ほかのアイコンの攻撃力 +attack */
  | { do: "rally"; attack: number }
  /** このターン、自分のアイコンはガードを無視して攻撃できる */
  | { do: "breakthrough" }
  /** 自分の場のアイコン1体につき、相手のマスターに amount ダメージ */
  | { do: "burnPerAlly"; amount: number; kaiwai?: Kaiwai }
  /** 体力が maxHp 以下の相手のアイコンをすべて倒す */
  | { do: "sweep"; maxHp: number }
  /** passive：相手のアイコンを倒すたび、もう1回攻撃できる */
  | { do: "extraAttackOnKill" }
  /** passive：センターにいる間、自分のほかのアイコンも注目と同じく伸びる */
  | { do: "focusAura" }
  /** passive：相手のターンの始めに、相手の攻撃力がいちばん高いアイコンを眠らせる */
  | { do: "lullaby" }
  /** hand：自分の場のアイコン1体につきコスト-1 */
  | { do: "cheaperPerAlly"; kaiwai?: Kaiwai }
  /** 山札から、その界隈のカードを上から count 枚探して手札に（足りない分は普通に引く） */
  | { do: "tutor"; kaiwai: Kaiwai; count: number }
  /** hand：このゲームで自分が回復の効果を使った回数だけコスト-1 */
  | { do: "cheaperPerHeal" }
  /** passive：自分が回復の効果を使うたび、このアイコンに攻撃力+attack・体力+hp */
  | { do: "healGrow"; attack: number; hp: number }
  /** passive：自分が回復の効果を使うたび、相手のマスターに amount ダメージ */
  | { do: "healBurn"; amount: number }
  /** hand：このゲームで自分が使った投稿1枚につきコスト-1 */
  | { do: "cheaperPerPost" }
  /** 相手のアイコンを倒す（体力に関係なく）。to が無ければ投稿の対象 */
  | { do: "destroy"; to?: "strongestEnemy" }
  /** 相手のアイコンを持ち主の手札に戻す。トークンは消える。to が無ければ投稿の対象 */
  | { do: "bounce"; to?: "costliestEnemy" }
  /** 次の相手のターンが終わるまで、自分のマスターはダメージを受けない */
  | { do: "shieldMaster" }
  /** 自分の場のアイコン per 体につき1枚引く（最大 max 枚。トークンも数える） */
  | { do: "drawPerAllies"; per: number; max: number }
  /** 変身：相手のアイコンを card（トークン）にする。to が無ければ投稿の対象、strongestEnemy なら攻撃力がいちばん高い相手 */
  | { do: "transform"; card: string; to?: "strongestEnemy" }
  /**
   * 蘇生：オワコンから、コスト maxCost 以下の自分のアイコン1枚を場に戻す
   * （いちばんコストが高いもの。同じなら、あとにオワコンになったもの。「場に出たとき」の効果も働く）
   */
  | { do: "revive"; maxCost: number }
) & {
  on?: EffectTrigger;
  /** 条件：自分の場（このアイコンを含む）に、その属性（または界隈）のアイコンが atLeast 体以上いるときだけ */
  if?: { allies: Attribute; atLeast: number } | { kaiwai: Kaiwai; atLeast: number };
};

/**
 * 闇堕ちの姿。★5 の一部が持つ。そのカードがオワコンに行ったら、自分のターンの好きなときに1回だけ、
 * コストなしで闇堕ちの姿として場に出せる（出たターンは攻撃できない）
 */
export interface DarkSide {
  name: string;
  attack: number;
  hp: number;
  keywords: Keyword[];
  /** 闇堕ちの姿の効果（on: "play" は闇堕ちして出てきたときに働く） */
  effects?: CardEffect[];
  effect: string;
  /** 闇堕ちの姿の絵（web の public からのパス）。無ければ元の絵 */
  art?: string;
  subject?: string;
  /** 印刷用の元画像（リポジトリ直下からのパス） */
  original?: string;
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
  /** 0〜1個。0個は共通カード（どのデッキにも入れられる）。勝ち方とデッキの決まりを担う軸 */
  attributes: Attribute[];
  /** 0〜2個。場で手を組む相手（仲間）を決める軸。2界隈は★3以上の少数だけ */
  kaiwai: Kaiwai[];
  keywords: Keyword[];
  effects: CardEffect[];
  /** 投稿の対象 */
  target?: PostTarget;
  /** 投稿の対象を、自分のその界隈のアイコンだけに限る（target が allyIcon のとき） */
  targetKaiwai?: Kaiwai;
  /** 投稿の対象を絞る：ダメージを受けているアイコンだけ／攻撃力が N 以下だけ */
  targetFilter?: { damaged?: boolean; maxAttack?: number };
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
export const DECK_SIZE = 30;
/** 1つのデッキに入れられる属性の数（共通カードは数えない） */
export const MAX_DECK_ATTRIBUTES = 2;
export const MAX_COPIES = 3;
