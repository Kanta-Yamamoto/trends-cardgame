/** 属性：その話題に人がどう反応したか */
export type Attribute = "炎" | "推し" | "水" | "自然" | "神";
/** 界隈：そのカードが何者か（いわゆる種族）。属性をまたいで付け、場で手を組む相手を決める軸。2界隈は★3以上の少数だけ */
export type Kaiwai = "ミーム" | "アイドル" | "配信者" | "有識者" | "動物";
/**
 * キーワード能力。
 * - ガード：相手はガード（と晒し状態）しか攻撃できない
 * - 速攻：場に出たターンに攻撃できる（プレイヤーも）
 * - 突進：場に出たターンに、相手のキャラクターにだけ攻撃できる（キーワード自体でステータスは上がらない。「突進で攻撃したとき」の効果はカードごと）
 * - 連撃：1ターンに2回攻撃できる
 * - 注目：自分のターンの始めに攻撃力+1（センターなら+2）
 * - 便乗：自分と相手のどちらかがほかのキャラクターにバズを使うたび、攻撃力+1・体力+1（10月25日。バズった曲にアイドルが乗る）
 */
export type Keyword = "ガード" | "速攻" | "突進" | "連撃" | "注目" | "便乗";
/** キャラクター：場に出て戦う／呪文：使い切りの効果 */
export type CardType = "icon" | "post";
/** ★1〜★5（★5 が最高） */
export type Rarity = 1 | 2 | 3 | 4 | 5;
/** 呪文の対象 */
export type PostTarget = "enemyIcon" | "allyIcon";

/**
 * 効果が働くとき。
 * play＝場に出たとき（呪文は使ったとき。省略時）／passive＝場にいる間ずっと／
 * turnEnd＝自分のターンの終わり／hand＝手札にある間（コストの補正）
 */
/**
 * play＝場に出たとき／passive＝場にいる間／turnEnd＝自分のターンの終わり／hand＝手札にある間／rush＝突進で攻撃したとき（出たターンに相手のキャラクターへ）／
 * death＝破壊されたとき（差し出されたときも。持ち主の効果として働く）
 */
export type EffectTrigger = "play" | "passive" | "turnEnd" | "hand" | "rush" | "death";

/** カードの効果（データで表す）。on ごとに、上から順に実行する */
export type CardEffect = (
  | {
      do: "summon";
      card: string;
      count: number;
      /** センター（真ん中の枠）に出したときの数 */
      centerCount?: number;
      /** このキャラクターの両隣（左、右の順）から埋める。埋まっていれば左から空いた枠へ。数は減らない */
      flank?: boolean;
      /** 出したキャラクターに強化（攻撃力+attack・体力+hp） */
      buff?: { attack: number; hp: number };
    }
  | { do: "copySelf" }
  | { do: "buffSelf"; attack: number; hp: number }
  | { do: "buffSelfPerPlayed"; attack: number }
  | { do: "buffRandomAlly"; attack: number; hp: number }
  /** 自分の場のほかのキャラクターすべて */
  /** 自分のほかのキャラクターすべてに。kaiwai を付けると、その界隈だけ */
  /** cards を付けると、そのカード（トークンの ID など）のキャラクターだけ（草の女王） */
  | { do: "buffAllies"; attack: number; hp: number; kaiwai?: Kaiwai; cards?: string[]; thisTurn?: boolean }
  /** play：このゲームで自分が先に手札から出した cards のキャラクター1体につき、このキャラクターに強化（伝説のコラ画像） */
  | { do: "growPerPlayed"; cards: string[]; attack: number; hp: number }
  | { do: "heal"; to: "master" | "allAlliesAndMaster" | "allAlliesFull"; amount?: number }
  | { do: "draw"; count: number; ifHandAtMost?: number }
  | { do: "removeEnemyGuards" }
  /** to が無ければ呪文の対象に */
  | { do: "damage"; to?: "strongestEnemy" | "allEnemies" | "enemyMaster"; amount: number }
  /** passive：自分の場のほかのキャラクター1体につき攻撃力+1 */
  /** 自分の場のほかのキャラクター1体につき攻撃力+1。kaiwai を付けると、その界隈だけ数える */
  /** play：出たときに、自分の場のほかのキャラクター（kaiwai があればその界隈）1体につき攻撃力+1。強化なので、あとで仲間が減っても下がらない */
  | { do: "attackPerAlly"; kaiwai?: Kaiwai }
  /** 晒し状態にする（ガードを失い、それまでの強化がすべて消える。ずっと続く）。to が無ければ呪文の対象を */
  | { do: "expose"; to?: "strongestEnemy" | "allEnemies" }
  /**
   * 炎上商法：このターン攻撃力 +attack。自分のターンの終わりに晒し状態になる。
   * 呪文なら対象（自分のキャラクター）に、キャラクターの「場に出たとき」なら自分に
   */
  | { do: "hype"; attack: number }
  /**
   * 差し出し（フィクサー）：自分と相手は、それぞれ自分のキャラクターを1体選ぶ。選ばれたキャラクターは破壊される。
   * 自分はこのキャラクター以外から選ぶ。選べるキャラクターが無い側は選ばない
   */
  | { do: "sacrifice" }
  /**
   * 調停（『調停者』）：自分と相手の場で、攻撃力がいちばん高いキャラクターすべてを破壊する（このキャラクターは除く）。
   * 同じ攻撃力なら、敵味方どちらもまとめて
   */
  | { do: "judge" }
  /**
   * 演出（『演出家』）：自分と相手の両方に空いている枠があれば、自分と相手は、それぞれ自分の山札から
   * 闇堕ちを持つカードを1枚（ランダムに）出し、突進を付ける。場に出たときの効果は働かない
   */
  | { do: "stageAces" }
  /** 相手のキャラクターの数 × per のダメージを、相手のキャラクターすべてに（ヒバナ） */
  | { do: "damagePerEnemy"; per: number }
  /** passive：このキャラクターが場にいる間、自分のターンの始めに自分の山札が0枚なら勝ち（陰謀論者。ドローより先に見る） */
  | { do: "conspiracyWin" }
  /**
   * play：出たとき（闇堕ちの姿なら闇堕ちしたとき）に、自分のトークン card（草など）がこのゲームで破壊された数だけ攻撃力+1（クサハミの闇の姿）。
   * 強化なので、その場で数え終えたらあとから変わらない
   */
  | { do: "attackPerLostToken"; card: string }
  /** passive：自分のトークン card（草など）が破壊されるたび、攻撃力+1（クサハミ）。同時に破壊されたらまとめて足す */
  | { do: "growOnTokenLost"; card: string }
  /** to が無ければ呪文の対象を眠り状態にする */
  | { do: "bind"; to?: "strongestEnemy" | "allEnemies" }
  /** to が無ければ呪文の対象を訂正する */
  | { do: "silence"; to?: "strongestEnemy" }
  /** 攻撃力を下げる。to が無ければ呪文の対象、allEnemies なら相手のキャラクターすべて */
  | { do: "weaken"; attack: number; to?: "allEnemies" }
  | { do: "buff"; attack: number; hp: number }
  | { do: "fill"; card: string }
  /** 強化と状態を消し、闇堕ちしたキャラクターを元の姿に戻す。to が allEnemies なら相手のキャラクターだけ（無ければ場のすべて） */
  | { do: "cleanse"; to?: "allEnemies" }
  /** 攻撃力 maxAttack 以下の相手のキャラクターのうち、いちばん強い1体を自分の場に奪う */
  /** 攻撃力 maxAttack 以下の相手のキャラクターを奪う（いちばん強いもの。呪文の対象があればそれ） */
  | { do: "steal"; maxAttack: number }
  /** このターンのあとに、もう一度自分のターンを行う */
  | { do: "extraTurn" }
  /** 自分のキャラクターすべてがすぐ攻撃できるようになり、ほかのキャラクターの攻撃力 +attack */
  | {
      do: "rally";
      attack: number /** すぐ攻撃できるのは相手のキャラクターだけ（突進を付ける） */;
      totsu?: boolean;
    }
  /** このターン、自分のキャラクターはガードを無視して攻撃できる */
  | { do: "breakthrough" }
  /** 自分の場のキャラクター1体につき、相手のプレイヤーに amount ダメージ */
  | { do: "burnPerAlly"; amount: number; kaiwai?: Kaiwai }
  /** 体力が maxHp 以下の相手のキャラクターをすべて破壊する */
  | { do: "sweep"; maxHp: number }
  /** passive：相手のキャラクターを破壊するたび、もう1回攻撃できる */
  | { do: "extraAttackOnKill" }
  /** passive：このキャラクターが攻撃して相手のキャラクターを破壊するたび、自分の cards（カード ID）のキャラクターすべてに強化（メン地下） */
  | { do: "buffOnKill"; cards: string[]; attack: number; hp: number }
  /** passive：このキャラクターが攻撃して相手のキャラクターを破壊するたび、相手のプレイヤーにダメージ（ヒバナ） */
  | { do: "faceOnKill"; amount: number }
  /** play：場（自分と相手）に kaiwai のキャラクターがいれば、ガードを得る（リスナー。出たときに一度だけ決まる） */
  | { do: "guardIfKaiwai"; kaiwai: Kaiwai }
  /** turnEnd など：自分の場の card のキャラクター1体につき、自分のライフを1回復する（ミナモ） */
  | { do: "healPerCard"; card: string }
  /** passive：自分が回復の効果を使うたび、コストがいちばん高い相手のキャラクター1体を持ち主の手札に戻す（不眠のルリ） */
  | { do: "healBounce" }
  /** passive：センターにいる間、自分のほかのキャラクターも注目と同じく伸びる */
  | { do: "focusAura" }
  /** passive：相手のターンの始めに、相手の攻撃力がいちばん高いキャラクターを眠り状態にする */
  | { do: "lullaby" }
  /** hand：自分の場のキャラクター1体につきコスト-1 */
  | { do: "cheaperPerAlly"; kaiwai?: Kaiwai }
  /** 山札から、その界隈のカードを上から count 枚探して手札に（足りない分は普通に引く） */
  /** play：山札から探して手札に加える。kaiwai の界隈のカード、または guard（ガードを持つ）・attribute の属性のキャラクター。なければ引く */
  | { do: "tutor"; kaiwai?: Kaiwai; guard?: boolean; attribute?: Attribute; count: number }
  /** hand：このゲームで自分が回復の効果を使った回数だけコスト-1 */
  | { do: "cheaperPerHeal" }
  /** play：自分の手札でいちばんコストが高い attribute 属性のカード1枚のコスト-amount（雑学博士）。出すまで続く */
  | { do: "discountHand"; attribute: Attribute; amount: number }
  /** passive：このキャラクターが攻撃されたとき、受けるダメージを amount 減らす（ベテラン解説者） */
  | { do: "armor"; amount: number }
  /** hand：このゲームで自分が出したガードの数だけコスト-1（ネ申） */
  | { do: "cheaperPerGuard" }
  /** play：カード（呪文のトークンなど）を手札に加える。手札が上限なら加えられない（トークンは消える） */
  | { do: "addToHand"; cards: string[] }
  /** play：次の相手のターンの終わりまで、自分のプレイヤーが受けるダメージを1回ごとに amount 減らす（盾） */
  | { do: "damageCut"; amount: number }
  /** passive：自分が回復の効果を使うたび、このキャラクターに攻撃力+attack・体力+hp */
  | { do: "healGrow"; attack: number; hp: number }
  /** passive：自分が回復の効果を使うたび、相手のプレイヤーに amount ダメージ */
  | { do: "healBurn"; amount: number }
  /** passive：自分が回復の効果を使うたび、攻撃力がいちばん高い相手のキャラクター1体に amount ダメージ（柴犬） */
  | { do: "healStrike"; amount: number }
  /** hand：このゲームで自分が使った呪文1枚につきコスト-1 */
  | { do: "cheaperPerPost" }
  /** 相手のキャラクターを破壊する（体力に関係なく）。to が無ければ呪文の対象 */
  | { do: "destroy"; to?: "strongestEnemy" }
  /** 相手のキャラクターを持ち主の手札に戻す。トークンは消える。to が無ければ呪文の対象 */
  | { do: "bounce"; to?: "costliestEnemy" }
  /** 次の相手のターンが終わるまで、自分のプレイヤーはダメージを受けない */
  | { do: "shieldMaster" }
  /** 相手のプレイヤーに「次の自分のターンの終わりに amount ダメージを受ける」効果を付与する（ミコト） */
  | { do: "delayedDamage"; amount: number }
  /** 自分の場のキャラクター per 体につき1枚引く（最大 max 枚。トークンも数える） */
  | { do: "drawPerAllies"; per: number; max: number }
  /** 変身：相手のキャラクターを card（トークン）にする。to が無ければ呪文の対象、strongestEnemy なら攻撃力がいちばん高い相手 */
  | { do: "transform"; card: string; to?: "strongestEnemy" }
  /**
   * 蘇生：墓地から、コスト maxCost 以下の自分のキャラクター1枚を場に戻す
   * （いちばんコストが高いもの。同じなら、あとに破壊されたもの。「場に出たとき」の効果も働く）
   */
  | { do: "revive"; maxCost: number }
) & {
  on?: EffectTrigger;
  /**
   * 条件：自分の場（このキャラクターを含む）に、その属性（または界隈）のキャラクターが atLeast 体以上いるときだけ／
   * center：このキャラクターがセンターにいるときだけ
   */
  if?: { allies: Attribute; atLeast: number } | { kaiwai: Kaiwai; atLeast: number } | { center: true };
};

/**
 * 闇堕ちの姿。★5 の一部が持つ。そのカードが破壊されたら、自分のターンの好きなときに1回だけ、
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
  type: CardType;
  rarity: Rarity;
  cost: number;
  /** キャラクターだけが持つ */
  attack?: number;
  hp?: number;
  /** 0〜1個。0個はニュートラルのカード（どのデッキにも入れられる）。勝ち方とデッキの決まりを担う軸 */
  attributes: Attribute[];
  /** 0〜2個。場で手を組む相手（仲間）を決める軸。2界隈は★3以上の少数だけ */
  kaiwai: Kaiwai[];
  keywords: Keyword[];
  effects: CardEffect[];
  /** 呪文の対象 */
  target?: PostTarget;
  /** 呪文の対象を、自分のその界隈のキャラクターだけに限る（target が allyIcon のとき） */
  targetKaiwai?: Kaiwai;
  /** 呪文の対象を絞る：ダメージを受けているキャラクターだけ／攻撃力が N 以下だけ */
  targetFilter?: { damaged?: boolean; maxAttack?: number };
  /**
   * カードに書く効果文。カードに載せる文字は、名前・コスト・攻撃力・体力・属性・界隈・★・種類・効果文・闇堕ちの札だけ
   * （肩書き・フレーバー・通し番号・飾りの文字は載せない。10月24日、docs/card-text.md）
   */
  effect: string;
  dark?: DarkSide;
  /** 効果で生まれるだけのカード（デッキには入れられない） */
  token?: boolean;
  /** web の public からのパス。イラストがまだないカードは持たない */
  art?: string;
  subject?: string;
  /** 印刷用の元画像（リポジトリ直下からのパス） */
  original?: string;
}

export const ATTRIBUTES: readonly Attribute[] = ["炎", "推し", "水", "自然", "神"];
export const KAIWAI: readonly Kaiwai[] = ["ミーム", "アイドル", "配信者", "有識者", "動物"];
/** デッキの枚数（2026-10-20 に 30→20。エース2枚＝闇堕ちは最大2回、を枚数で感じられるように） */
export const DECK_SIZE = 20;
/** 1つのデッキに入れられる属性の数（共通カードは数えない）。初期リリースは単属性だけ（2026-10-19 に 2→1） */
export const MAX_DECK_ATTRIBUTES = 1;
export const MAX_COPIES = 2;
/** 1つのデッキに入れられる、闇堕ちを持つカードの枚数。種類は問わない（2026-10-24 に「1種類まで」から変更。★5 の種類は制限しない） */
export const MAX_DARK_CARDS = 2;
