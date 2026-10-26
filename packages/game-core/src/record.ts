import { applyAction } from "./engine";
import type { CpuThought } from "./search";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

type Catalog = Record<string, RuleCard>;

/**
 * CPU 対戦の記録。人と CPU の対戦を一手ずつ残し、あとで見返して CPU を強くする（最終の目的はカードのバランス調整。docs/cpu-logs.md）。
 * 最初の盤面（initial）に moves を順に applyAction すれば、対戦を最初から再生できる（乱数も state の中にあるので同じになる）
 */
export interface CpuGameRecord {
  /** 記録の形の版（形を変えたら上げる） */
  v: 1;
  /** カードのデータ（コスト・数値・効果）の印。カードを調整した前後の記録を見分ける */
  cards: string;
  /**
   * その試合のときのカードのデータ（両者のデッキのカードと、それが出すトークン・手札に加えるカード）。
   * カードの数値や効果を変えたあとも、昔の試合のときの値が読めるように残す（10月26日。それより前の記録には無い）
   */
  cardData?: Record<string, CardSnapshot>;
  /** 人が使う側と CPU が使う側 */
  human: PlayerId;
  cpu: PlayerId;
  /** デッキ（構築済みの ID か "custom:…"）と中身 */
  humanDeck: { ref: string; name: string; cards: string[] };
  cpuDeck: { ref: string; cards: string[] };
  seed: number;
  first: PlayerId;
  /** 始めの時刻（ミリ秒） */
  startedAt: number;
  initial: GameState;
  /**
   * 起きた順の操作。at は始めからの経過（ミリ秒。人が考えた時間を見るため）。
   * card・target はその手で使ったカードと相手のカード（moveCards）。カードやルールを変えて再生できなくなった古い記録でも、
   * 何をいつ使ったかが分かるように残す（10月26日。それより前の記録には無い）
   */
  moves: ({ action: Action; at: number } & MoveCards)[];
  /** CPU が考えた中身。move は、そのとき次に入る moves の番号（そこから CPU の手が続く） */
  thoughts: (CpuThought & { move: number })[];
  /** 決着。winner が無ければ途中でやめた */
  end: { winner: PlayerId | null; turn: number; at: number };
}

/** 記録に残すカードのデータ（対戦に効く値と名前。絵や説明の文は残さない） */
export type CardSnapshot = Pick<
  RuleCard,
  "type" | "cost" | "attack" | "hp" | "keywords" | "effects" | "target" | "kaiwai" | "attributes"
> & {
  name?: string;
  dark?: Pick<NonNullable<RuleCard["dark"]>, "attack" | "hp" | "keywords" | "effects"> & { name?: string };
};

/** カード1枚の、記録に残すデータ */
function snapshotOf(c: RuleCard & { name?: string }): CardSnapshot {
  const out: CardSnapshot = {
    name: c.name,
    type: c.type,
    cost: c.cost,
    attack: c.attack,
    hp: c.hp,
    keywords: c.keywords,
    effects: c.effects,
    target: c.target,
    kaiwai: c.kaiwai,
    attributes: c.attributes,
  };
  if (c.dark)
    out.dark = {
      name: (c.dark as { name?: string }).name,
      attack: c.dark.attack,
      hp: c.dark.hp,
      keywords: c.dark.keywords,
      effects: c.dark.effects,
    };
  return out;
}

/** ids のカードと、その効果が出す・手札に加えるカード（効果の中に出てくるカードの ID）のデータを集める */
export function cardSnapshot(catalog: Catalog, ids: readonly string[]): Record<string, CardSnapshot> {
  const out: Record<string, CardSnapshot> = {};
  const visit = (id: string) => {
    const c = catalog[id];
    if (!c || out[id]) return;
    out[id] = snapshotOf(c);
    // 効果の中のカードの ID（出すトークン・手札に加える呪文など）もたどる
    const walk = (x: unknown) => {
      if (typeof x === "string") {
        if (x !== id && catalog[x]) visit(x);
      } else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk(c.effects);
    walk(c.dark?.effects);
  };
  for (const id of ids) visit(id);
  return out;
}

/** 手で使ったカードの ID（出す・使う手札のカード、攻撃・バズ・差し出しのキャラクター）と、攻撃先・呪文の対象のカードの ID */
export interface MoveCards {
  card?: string;
  target?: string;
}

/** 手を当てる前の盤面から、その手で使ったカードと相手のカードを取り出す */
export function moveCards(before: GameState, action: Action): MoveCards {
  const me = before.players[action.player];
  const foe = before.players[action.player === "p1" ? "p2" : "p1"];
  const out: MoveCards = {};
  switch (action.type) {
    case "play":
      out.card = me.hand[action.handIndex];
      break;
    case "cast":
      out.card = me.hand[action.handIndex];
      if (action.target)
        out.target = (action.target.side === "enemy" ? foe : me).field[action.target.slot]?.cardId;
      break;
    case "attack":
      out.card = me.field[action.from]?.cardId;
      if (action.target.kind === "unit") out.target = foe.field[action.target.slot]?.cardId;
      break;
    case "buzz":
    case "sacrifice":
      out.card = me.field[action.slot]?.cardId;
      break;
  }
  if (out.card === undefined) delete out.card;
  if (out.target === undefined) delete out.target;
  return out;
}

/** カードのデータの印（対戦に効く値だけを並べて縮めたもの） */
export function cardsStamp(catalog: Catalog): string {
  const text = JSON.stringify(
    Object.keys(catalog)
      .sort()
      .map((id) => {
        const c = catalog[id];
        if (!c) return [id];
        // 闇の姿は名前・絵を除いて、数値と効果だけ
        const dark = c.dark ? [c.dark.attack, c.dark.hp, c.dark.keywords, c.dark.effects] : null;
        return [
          id,
          c.type,
          c.cost,
          c.attack,
          c.hp,
          c.keywords,
          c.effects,
          c.target ?? null,
          c.kaiwai,
          c.attributes,
          dark,
        ];
      }),
  );
  // FNV-1a（32 ビット）
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * 記録を最初から再生する。途中の state（moves[i] の前の盤面）を順に返す。
 * 再生できなかった（カードのデータが変わったなど）ときは、そこまでの state と、止まった手の番号を返す
 */
export function replayRecord(
  rec: CpuGameRecord,
  catalog: Catalog,
): { states: GameState[]; final: GameState; failedAt: number | null } {
  const states: GameState[] = [];
  let s = rec.initial;
  for (let i = 0; i < rec.moves.length; i++) {
    states.push(s);
    const m = rec.moves[i];
    if (!m) break;
    try {
      s = applyAction(s, m.action, catalog).state;
    } catch {
      return { states, final: s, failedAt: i };
    }
  }
  return { states, final: s, failedAt: null };
}
