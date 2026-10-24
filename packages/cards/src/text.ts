import { KEYWORD_ORDER } from "./glossary";
import type { CardDef, CardEffect, DarkSide, Kaiwai } from "./types";

/**
 * 効果データ（effects）から効果文を組み立てる。書き方の決まりは docs/card-text.md、
 * 決まりの元にした代表的なカードゲームの調べは docs/research/card-text/。
 * 呼び名は用語集（glossary.ts）のものだけを使う。cards.json の effect は、この関数の結果と同じにする（テストで確かめる）
 */

/** 1 枚の効果文の長さの上限（字。10月24日にオーナーが決めた） */
export const MAX_EFFECT_LENGTH = 100;

/** カード ID から名前を引く（トークンの名前を書くため） */
export type NameOf = (id: string) => string;

/** 効果文の中の、きっかけの区切り。この順に並べる */
type Section =
  | "hand"
  | "passive"
  | "play"
  | "rush"
  | "whenever"
  | "turnStart"
  | "turnEnd"
  | "foeTurnStart"
  | "death";

const SECTION_ORDER: readonly Section[] = [
  "hand",
  "passive",
  "play",
  "rush",
  "whenever",
  "turnStart",
  "turnEnd",
  "foeTurnStart",
  "death",
];

/**
 * きっかけの書き出し。名前の付いたきっかけは【】のラベルにする（Shadowverse の【ファンファーレ】【ラストワード】【攻撃時】の型）。
 * 時の指定（自分のターンの終わりに、など）は、Shadowverse の「自分のターン終了時、」と同じく文で書く。
 * 闇堕ちの姿の【場に出たとき】は【闇堕ちしたとき】
 */
export const TRIGGER_LABELS = [
  "【場に出たとき】",
  "【闇堕ちしたとき】",
  "【突進で攻撃したとき】",
  "【破壊されたとき】",
] as const;

function lead(section: Section, dark: boolean): string {
  switch (section) {
    case "hand":
      return "手札にある間、";
    case "play":
      return dark ? "【闇堕ちしたとき】" : "【場に出たとき】";
    case "rush":
      return "【突進で攻撃したとき】";
    case "turnEnd":
      return "自分のターンの終わりに、";
    case "death":
      return "【破壊されたとき】";
    default:
      // 場にいる間ずっと・〜するたび・ターンの始め は、文の中に書く
      return "";
  }
}

/** 効果がどの区切りに入るか */
function sectionOf(e: CardEffect): Section {
  switch (e.do) {
    case "extraAttackOnKill":
    case "buffOnKill":
    case "faceOnKill":
    case "healGrow":
    case "healBurn":
    case "healStrike":
    case "healBounce":
      return "whenever";
    case "conspiracyWin":
      return "turnStart";
    case "lullaby":
      return "foeTurnStart";
  }
  switch (e.on ?? "play") {
    case "hand":
      return "hand";
    case "passive":
      return "passive";
    case "rush":
      return "rush";
    case "turnEnd":
      return "turnEnd";
    case "death":
      return "death";
    default:
      return "play";
  }
}

const ENEMY = "相手のキャラクター";
const ALLY = "自分のキャラクター";
const THAT = "そのキャラクター";
const ALL_ALLIES = `${ALLY}すべて`;
const STRONGEST = `攻撃力がいちばん高い${ENEMY}1体`;

/** 攻撃力+N・体力+N（0 の側は書かない） */
function stats(attack: number, hp: number): string {
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return [attack ? `攻撃力${sign(attack)}` : "", hp ? `体力${sign(hp)}` : ""].filter(Boolean).join("・");
}

const kaiwaiOr = (k: Kaiwai | undefined, plain: string) => (k ? `${k}種族` : plain);

/** 組み立てに使う、カードの情報 */
interface Ctx {
  card: CardDef;
  nameOf: NameOf;
  /** キャラクターの効果か（呪文でなく） */
  icon: boolean;
  /** 破壊されたときの効果か（自分はもう場にいない） */
  death: boolean;
}

/** 呪文の対象（遊ぶ人が選ぶ1体） */
function chosen(card: CardDef): string {
  if (card.target === "allyIcon") return `自分の${kaiwaiOr(card.targetKaiwai, "キャラクター")}1体`;
  const f = card.targetFilter;
  if (f?.damaged) return `ダメージを受けている${ENEMY}1体`;
  if (f?.maxAttack !== undefined) return `攻撃力が${f.maxAttack}以下の${ENEMY}1体`;
  return `${ENEMY}1体`;
}

/** 効果の対象の書き方。同じ対象が続くときは「そのキャラクター」にするため、キーも返す */
function targetOf(e: CardEffect, ctx: Ctx): { key: string; noun: string } {
  const to = "to" in e ? e.to : undefined;
  switch (to) {
    case "strongestEnemy":
      return { key: to, noun: STRONGEST };
    case "costliestEnemy":
      return { key: to, noun: `コストがいちばん高い${ENEMY}1体` };
    case "allEnemies":
      return { key: to, noun: `${ENEMY}すべて` };
    case "enemyMaster":
      return { key: to, noun: "相手のプレイヤー" };
    default:
      return { key: "chosen", noun: chosen(ctx.card) };
  }
}

/** 山札から探すものの書き方 */
function tutorWhat(e: Extract<CardEffect, { do: "tutor" }>): string {
  if (e.kaiwai) return `${e.kaiwai}種族のカード`;
  return `${e.guard ? "ガードを持つ" : ""}${e.attribute ? `${e.attribute}属性の` : ""}キャラクター`;
}

/** 条件（if）の書き出し */
function condition(e: CardEffect): string {
  if ("ifHandAtMost" in e && e.ifHandAtMost !== undefined) return `手札が${e.ifHandAtMost}枚以下なら、`;
  const c = e.if;
  if (!c) return "";
  if ("center" in c) return "このキャラクターがセンターにいれば、";
  const what = "kaiwai" in c ? `${c.kaiwai}種族` : `${c.allies}属性`;
  return c.atLeast <= 1 ? `自分の場に${what}がいれば、` : `自分の場に${what}が${c.atLeast}体以上いれば、`;
}

/** 前の効果と同じ動き（条件付きで重ねるときに「さらに」と書く） */
function family(e: CardEffect): string {
  if (e.do === "tutor" || e.do === "draw") return "draw";
  if (e.do === "damage") return `damage:${e.to ?? ""}`;
  return e.do;
}

/**
 * 効果1つを、文1つ（「。」なし）にする。
 * prev は同じきっかけの中の1つ前の効果（同じ対象を「そのキャラクター」と書くため）
 */
function sentence(e: CardEffect, ctx: Ctx, prev: CardEffect | undefined): string {
  const t = targetOf(e, ctx);
  const prevKey = prev && "to" in prev ? (prev.to ?? "chosen") : prev ? "chosen" : undefined;
  const prevTargets =
    prev !== undefined &&
    ["damage", "expose", "bind", "silence", "weaken", "destroy", "bounce", "transform", "buff"].includes(
      prev.do,
    );
  // 1体だけの対象が続くときは「そのキャラクター」と書く（すべて・プレイヤーは、そのまま書く）
  const noun =
    prevTargets && prevKey === t.key && (t.key === "chosen" || t.key === "strongestEnemy") ? THAT : t.noun;
  const more = condition(e) !== "" && prev !== undefined && family(prev) === family(e);
  const cond = condition(e) + (more ? "さらに" : "");
  const others = ctx.icon && !ctx.death ? "ほかの" : "";

  const body = ((): string => {
    switch (e.do) {
      case "damage":
        if (more) return `${e.amount}ダメージ`;
        return `${noun}に${e.amount}ダメージ`;
      case "damagePerEnemy":
        return `${ENEMY}すべてに、${ENEMY}1体につき${e.per}ダメージ`;
      case "burnPerAlly":
        return `自分の場の${kaiwaiOr(e.kaiwai, "キャラクター")}1体につき、相手のプレイヤーに${e.amount}ダメージ`;
      case "delayedDamage":
        return `相手のプレイヤーに「次の自分のターンの終わりに${e.amount}ダメージを受ける」効果を付与する`;
      case "draw":
        return `カードを${e.count}枚引く`;
      case "drawPerAllies":
        return `自分の場のキャラクター${e.per}体につき、カードを1枚引く。引くのは${e.max}枚まで`;
      case "tutor":
        return `山札から${tutorWhat(e)}を${e.count}枚探して手札に加える。なければカードを${e.count}枚引く`;
      case "heal": {
        const who = e.to === "master" ? "自分のライフ" : `${ALL_ALLIES}と自分のライフ`;
        return e.to === "allAlliesFull"
          ? `${ALL_ALLIES}の体力をすべて回復する`
          : `${who}を${e.amount}回復する`;
      }
      case "destroy":
        return `${noun}を破壊する`;
      case "sweep":
        return `体力が${e.maxHp}以下の${ENEMY}すべてを破壊する`;
      case "bounce":
        return `${noun}を持ち主の手札に戻す`;
      case "transform":
        return `${noun}を${ctx.nameOf(e.card)}にする`;
      case "steal":
        if (!ctx.icon) return `${chosen(ctx.card)}を奪う`;
        return `攻撃力が${e.maxAttack}以下の${ENEMY}のうち、攻撃力がいちばん高い1体を奪う`;
      case "expose":
        return `${noun}を晒し状態にする`;
      case "bind":
        return `${noun}を眠り状態にする`;
      case "silence":
        return `${noun}を沈黙状態にする`;
      case "weaken":
        return `${noun}の${stats(-e.attack, 0)}`;
      case "cleanse":
        return e.to === "allEnemies"
          ? `${ENEMY}すべての強化と状態を消し、闇堕ちした${ENEMY}を元の姿に戻す`
          : "場のキャラクターすべての強化と状態を消し、闇堕ちしたキャラクターを元の姿に戻す";
      case "buff":
        return `${noun}に${stats(e.attack, e.hp)}`;
      case "buffSelf":
        return stats(e.attack, e.hp);
      case "buffRandomAlly":
        return `ランダムな自分の${others}キャラクター1体に${stats(e.attack, e.hp)}`;
      case "buffAllies":
        return `自分の${others}${kaiwaiOr(e.kaiwai, "キャラクター")}すべてに${e.thisTurn ? "このターン" : ""}${stats(e.attack, e.hp)}`;
      case "hype":
        return ctx.icon
          ? `このターン攻撃力+${e.attack}。このターンの終わりに、このキャラクターを晒し状態にする`
          : `${chosen(ctx.card)}に、このターン攻撃力+${e.attack}。このターンの終わりに、${THAT}を晒し状態にする`;
      case "rally":
        return [
          `${ALL_ALLIES}に${e.totsu ? "突進" : "速攻"}を付ける`,
          e.attack ? `自分のほかのキャラクターすべてに${stats(e.attack, 0)}` : "",
        ]
          .filter(Boolean)
          .join("。");
      case "breakthrough":
        return `このターン、${ALL_ALLIES}はガードを無視して攻撃できる`;
      case "removeEnemyGuards":
        return `${ENEMY}すべてのガードを消す`;
      case "summon": {
        const name = ctx.nameOf(e.card);
        const buffed = e.buff ? `。出した${name}に${stats(e.buff.attack, e.buff.hp)}` : "";
        if (e.sides) return `左右の空いている枠に、${name}を1体ずつ出す${buffed}`;
        if (e.flank && e.centerCount !== undefined)
          return `隣に${name}を${e.count}体出す。センターに出したときは、左右に${e.centerCount}体出す${buffed}`;
        if (e.flank) return `隣に${name}を${e.count}体出す${buffed}`;
        return `${name}を${e.count}体出す${buffed}`;
      }
      case "fill":
        return `自分の空いている枠すべてに${ctx.nameOf(e.card)}を出す`;
      case "copySelf":
        return "自分の空いている枠に、トークンとしてこのキャラクターのコピーを1体出す";
      case "revive":
        return `墓地のコストが${e.maxCost}以下の自分のキャラクターのうち、コストがいちばん高い1体を場に戻す。【場に出たとき】も働く`;
      case "attackPerAlly":
        return `自分の場のほかの${kaiwaiOr(e.kaiwai, "キャラクター")}1体につき攻撃力+1`;
      case "attackPerLostToken":
        return `自分の${ctx.nameOf(e.card)}が、このゲームで破壊された数だけ攻撃力+1`;
      case "extraAttackOnKill":
        return `${ENEMY}を破壊するたび、もう1回攻撃できる`;
      case "buffOnKill":
        return `このキャラクターが${ENEMY}を破壊するたび、自分の${e.cards.map(ctx.nameOf).join("と")}すべてに${stats(e.attack, e.hp)}`;
      case "faceOnKill":
        return `このキャラクターが${ENEMY}を破壊するたび、相手のプレイヤーに${e.amount}ダメージ`;
      case "guardIfKaiwai":
        return `場に${e.kaiwai}種族がいれば、ガードを得る`;
      case "healPerCard":
        return `自分の場の${ctx.nameOf(e.card)}1体につき、自分のライフを1回復する`;
      case "healBounce":
        return `自分が回復の効果を使うたび、コストがいちばん高い${ENEMY}1体を持ち主の手札に戻す`;
      case "healGrow":
        return `自分が回復の効果を使うたび、${stats(e.attack, e.hp)}`;
      case "healBurn":
        return `自分が回復の効果を使うたび、相手のプレイヤーに${e.amount}ダメージ`;
      case "healStrike":
        return `自分が回復の効果を使うたび、${STRONGEST}に${e.amount}ダメージ`;
      case "conspiracyWin":
        return "自分のターンの始めに、自分の山札が0枚なら勝ち";
      case "lullaby":
        return `相手のターンの始めに、${STRONGEST}を眠り状態にする`;
      case "focusAura":
        return "センターにいる間、自分のほかのキャラクターも注目を持つ";
      case "cheaperPerAlly":
        return `自分の場の${kaiwaiOr(e.kaiwai, "キャラクター")}1体につきコスト-1`;
      case "armor":
        return `このキャラクターが攻撃されたとき、受けるダメージを${e.amount}減らす`;
      case "discountHand":
        return `自分の手札でいちばんコストが高い${e.attribute}属性のカード1枚のコスト-${e.amount}`;
      case "cheaperPerGuard":
        return "このゲームで自分が出したガードの数だけコスト-1";
      case "addToHand":
        return `${e.cards.map(ctx.nameOf).join("・")}を手札に加える`;
      case "damageCut":
        return `次の相手のターンの終わりまで、自分のプレイヤーが受けるダメージを1回ごとに${e.amount}減らす`;
      case "cheaperPerHeal":
        return "このゲームで自分が回復の効果を使った回数だけコスト-1";
      case "cheaperPerPost":
        return "このゲームで自分が使った呪文1枚につきコスト-1";
      case "shieldMaster":
        return "自分のプレイヤーを無敵状態にする";
      case "extraTurn":
        return "このターンのあとに、もう一度自分のターンを行う";
      case "sacrifice":
        return "自分と相手は、それぞれ自分のキャラクターを1体選ぶ。選ばれたキャラクターは破壊される";
      case "judge":
        return "このキャラクターを除いて、自分と相手の場で攻撃力がいちばん高いキャラクターすべてを破壊する";
      case "stageAces":
        return "自分と相手の両方に空いている枠があれば、自分と相手は、それぞれ自分の山札から闇堕ちを持つカードを1枚出し、そのキャラクターに突進を付ける。そのキャラクターの【場に出たとき】は働かない";
      case "buffSelfPerPlayed":
        // キーワード「コンボ」として先頭に書く
        return "";
    }
  })();
  return body ? cond + body : "";
}

/** キーワード・効果から、効果文を組み立てる */
function build(
  keywords: readonly string[],
  effects: readonly CardEffect[],
  card: CardDef,
  nameOf: NameOf,
  dark: boolean,
): string {
  const combo = effects.some((e) => e.do === "buffSelfPerPlayed");
  const has = new Set<string>([...keywords, ...(combo ? ["コンボ"] : [])]);
  const head = KEYWORD_ORDER.filter((k) => has.has(k))
    .map((k) => `${k}。`)
    .join("");
  const body = SECTION_ORDER.map((section) => {
    const list = effects.filter((e) => sectionOf(e) === section);
    const ctx: Ctx = { card, nameOf, icon: card.type === "icon", death: section === "death" };
    // 2 枚目以降の同じ「自分のコピー」は、1つの文にまとめて数を増やす
    const copies = list.filter((e) => e.do === "copySelf").length;
    const parts: string[] = [];
    let prev: CardEffect | undefined;
    for (const e of list) {
      if (e.do === "copySelf" && prev?.do === "copySelf") continue;
      let s = sentence(e, ctx, prev);
      if (e.do === "copySelf" && copies > 1) s = s.replace("コピーを1体", `コピーを${copies}体`);
      if (s) parts.push(s);
      prev = e;
    }
    if (parts.length === 0) return "";
    const l = card.type === "post" && section === "play" ? "" : lead(section, dark);
    // 動き1つを文1つにする（「〜し、〜する」でつながない）。同じ対象が続くときは「そのキャラクター」
    return l + parts.map((p) => `${p}。`).join("");
  }).join("");
  return head + body;
}

/** カードの効果文（元の姿） */
export function effectText(card: CardDef, nameOf: NameOf): string {
  return build(card.keywords, card.effects, card, nameOf, false);
}

/** 闇堕ちの姿の効果文 */
export function darkEffectText(card: CardDef & { dark: DarkSide }, nameOf: NameOf): string {
  return build(card.dark.keywords, card.dark.effects ?? [], card, nameOf, true);
}
