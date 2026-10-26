import type { Attribute, Kaiwai } from "./types";

/**
 * 用語集（ユビキタス言語）。カードの効果文・画面の文字は、ここの呼び名だけを使う。
 * 一覧と考え方は docs/glossary.md、効果文の書き方は docs/card-text.md。
 * 使わない呼び名（BANNED_TERMS）は、効果文と画面の文字に入っているとテストで落ちる。
 */

/** 属性を持たないカード（どのデッキにも入れられる）の呼び名 */
export const NEUTRAL = "ニュートラル";

/** キーワードを効果文に書く順（1 つずつ「。」で区切って、効果文の先頭に置く） */
export const KEYWORD_ORDER = ["ガード", "速攻", "突進", "連撃", "注目", "便乗", "コンボ"] as const;

export type TermKind = "keyword" | "state" | "dark" | "word";

/** 押すと解説の小窓が開く語と、その説明 */
export interface Term {
  title: string;
  text: string;
  kind: TermKind;
}

const ATTRIBUTE_HELP: Record<Attribute, string> = {
  炎: "相手の頼りのキャラクターを晒し状態にしてガードと強化を剥がし、速攻・突進の手数で削る。息切れが早く、体力が低い。",
  推し: "推しを育てて後半に押し切る。注目・強化・センター。育つ前は弱く、晒し状態にされると育てた分が消える。",
  水: "回復・眠り状態・ガードで粘り、回復するたびに強くなる。回復の仕組みがそろう前に押し切られると弱い。",
  自然: "トークンで場を埋めて、数で押す。1体ずつは弱い。",
  神: "引き続けて、確実に除去する。守りを上回る攻撃力には押し切られる。",
};

const KAIWAI_MARK: Record<Kaiwai, string> = {
  配信者: "配",
  アイドル: "ア",
  有識者: "有",
  動物: "動",
  ミーム: "ミ",
};

/** 効果文・画面で押せる語（キーワード・状態・仕組み）。キーは効果文に書く形 */
export const TERMS: Record<string, Term> = {
  ガード: {
    title: "ガード",
    text: "相手の場にガードがいる間、相手はガードしか攻撃できない。プレイヤーもほかのキャラクターも守られる。",
    kind: "keyword",
  },
  速攻: {
    title: "速攻",
    text: "場に出たターンに攻撃できる。相手のキャラクターにもプレイヤーにも攻撃できる。",
    kind: "keyword",
  },
  突進: {
    title: "突進",
    text: "場に出たターンに、相手のキャラクターにだけ攻撃できる。プレイヤーには攻撃できない。次のターンからは普通に攻撃できる。【突進で攻撃したとき】は殴る前に働くので、上がった攻撃力で殴る。",
    kind: "keyword",
  },
  連撃: { title: "連撃", text: "1ターンに2回攻撃できる。", kind: "keyword" },
  注目: {
    title: "注目",
    text: "自分のターンの始めに攻撃力+1。センター（場の真ん中の枠）にいると+2。",
    kind: "keyword",
  },
  便乗: {
    title: "便乗",
    text: "自分か相手がほかのキャラクターにバズを使うたび、攻撃力+1・体力+1。上がった分は強化なので、晒し状態で消える。",
    kind: "keyword",
  },
  コンボ: {
    title: "コンボ",
    text: "【場に出たとき】このターンに先に出したほかのカード1枚につき攻撃力+1。",
    kind: "keyword",
  },
  晒し状態: {
    title: "晒し状態",
    text: "ガードを失い、それまでの強化がすべて消える。ずっと続く。晒し状態になったあとの強化は消えない。水属性の「TL浄化」で元に戻る。",
    kind: "state",
  },
  眠り状態: {
    title: "眠り状態",
    text: "次の自分のターン、攻撃できない。",
    kind: "state",
  },
  沈黙状態: {
    title: "沈黙状態",
    text: "キーワードと効果が消える。ガードも無くなる。",
    kind: "state",
  },
  無敵状態: {
    title: "無敵状態",
    text: "プレイヤーは、次の相手のターンが終わるまでダメージを受けない。",
    kind: "state",
  },
  闇堕ち: {
    title: "闇堕ち",
    text: "闇堕ちを持つ★5が破壊されたら、その枠でカードが裏向きになる（その枠にはキャラクターを出せない）。破壊された次のターンから、自分のターンの好きなときに、コストなしで闇堕ちの姿でその枠に出せる。出たターンから相手のキャラクターに攻撃できる（突進）。【闇堕ちしたとき】も働く。闇堕ちの姿が破壊されたら、そのカードは消える。デッキに入れられる闇堕ちを持つカードは、種類を問わず2枚まで。",
    kind: "dark",
  },
  バズ: {
    title: "バズ",
    text: "1試合に2回、自分のキャラクター1体に攻撃力+2・体力+2と突進を付ける。自分の4ターン目から（後攻は3ターン目から）、1ターンに1回。強化なので、晒し状態になると消える。",
    kind: "word",
  },
  トークン: {
    title: "トークン",
    text: "効果で生まれるカード（草・リスナーなどのキャラクターと、盾などの呪文）。デッキに入れられないだけで、ほかはふつうのカードと同じ。手札に戻されたら手札に入り、破壊されたら・使ったら墓地に行く。",
    kind: "word",
  },
  草: {
    title: "草",
    text: "効果で出るトークン。攻撃力1・体力1。",
    kind: "word",
  },
  奪う: {
    title: "奪う",
    text: "相手のキャラクターを自分の場に移す。奪ったターンは攻撃できない。",
    kind: "word",
  },
  センター: {
    title: "センター",
    text: "場の5つの枠の真ん中。注目を持つキャラクターは、センターにいると伸びが大きい。",
    kind: "word",
  },
  ...Object.fromEntries(
    (Object.entries(ATTRIBUTE_HELP) as [Attribute, string][]).map(([a, text]) => [
      `${a}属性`,
      { title: `${a}属性`, text, kind: "word" as const },
    ]),
  ),
  ...Object.fromEntries(
    (Object.entries(KAIWAI_MARK) as [Kaiwai, string][]).map(([k, mark]) => [
      `${k}界隈`,
      {
        title: `${k}界隈`,
        text: `界隈が「${k}」のキャラクター。カードの属性の丸の横にある黒い四角の「${mark}」が目印。2つの界隈に入るカードは、どちらの仲間にも数える。界隈を読む効果は、自分の側のキャラクターだけを見る。`,
        kind: "word" as const,
      },
    ]),
  ),
};

/** 使わない呼び名と、代わりに使う呼び名。効果文と画面の文字に入っているとテストで落ちる（カード名の中は除く） */
export const BANNED_TERMS: readonly { word: string | RegExp; use: string }[] = [
  { word: "アイコン", use: "キャラクター" },
  { word: "フォロワー", use: "キャラクター" },
  { word: "ミニオン", use: "キャラクター" },
  { word: "投稿", use: "呪文" },
  { word: "スペル", use: "呪文" },
  { word: "オワコン", use: "墓地・破壊" },
  { word: "墓場", use: "墓地" },
  { word: "トラッシュ", use: "墓地" },
  { word: /(?<![圧面])倒/, use: "破壊" },
  { word: "マスター", use: "プレイヤー" },
  { word: "話題力", use: "コスト" },
  { word: "マナ", use: "コスト" },
  { word: "種族", use: "界隈" },
  { word: "凸", use: "突進" },
  { word: "ノリ", use: "コンボ" },
  { word: "訂正", use: "沈黙状態" },
  { word: "晒し者", use: "晒し状態" },
  { word: "眠らせ", use: "眠り状態にする" },
  { word: "ドロー", use: "カードを引く" },
  { word: "召喚", use: "出す" },
  { word: "闇の気配", use: "裏向きのカード" },
  { word: "登場時", use: "場に出たとき" },
  { word: "共通", use: NEUTRAL },
  { word: "アンコモン", use: "★" },
  { word: "コモン", use: "★" },
  { word: "レア", use: "★" },
  { word: "炎上", use: "炎" },
  { word: "メロい", use: "推し" },
  { word: "癒し", use: "水" },
  { word: "草属性", use: "自然属性" },
];

/**
 * 文の中の、使わない呼び名を探す。allow（カード名など、世界観の固有名）の中は数えない。
 * 見つかった呼び名と、代わりに使う呼び名を返す
 */
export function termViolations(text: string, allow: readonly string[] = []): { word: string; use: string }[] {
  let rest = text;
  for (const name of [...allow].sort((a, b) => b.length - a.length))
    if (name) rest = rest.split(name).join("");
  const found: { word: string; use: string }[] = [];
  for (const { word, use } of BANNED_TERMS) {
    const hit = typeof word === "string" ? rest.includes(word) : word.test(rest);
    if (hit) found.push({ word: typeof word === "string" ? word : (rest.match(word)?.[0] ?? ""), use });
  }
  return found;
}

/**
 * ソースコード（.ts・.tsx）の画面に出る文字の中から、使わない呼び名を探す。コメントの中は見ない。
 * 見つかった行（1 から数える）と呼び名を返す
 */
export function sourceTermViolations(
  source: string,
  allow: readonly string[] = [],
): { line: number; word: string; use: string; text: string }[] {
  const code = source
    // ブロックのコメント（JSX の {/* */} も）は、行の数を変えずに空白にする
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    // 行のコメント（"https://" のような文字の中の // は残す）
    .replace(/(?<![:"'`\\])\/\/[^\n]*/g, "");
  return code
    .split("\n")
    .flatMap((text, i) => termViolations(text, allow).map((v) => ({ line: i + 1, ...v, text: text.trim() })));
}
