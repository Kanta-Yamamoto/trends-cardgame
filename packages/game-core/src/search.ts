import { autoSacrifice, buzzValue, planTurn } from "./ai";
import {
  applyAction,
  attackTargets,
  buzzBlock,
  canUnitAttack,
  castTargets,
  darkFallSlots,
  darkOmens,
  delayedDamageOn,
  effectiveCost,
  hasPassive,
  openSlots,
  opponent,
  sacrificeCandidates,
  viewUnit,
} from "./engine";
import { type Action, CENTER_SLOT, type GameState, type PlayerId, type RuleCard } from "./types";

type Catalog = Record<string, RuleCard>;

/**
 * 強い CPU（先読みあり）。
 * 1ターンの中の「出す・使う・攻撃」の並びを、ビームサーチでたくさん試す。
 * 有望な終わり方は、ターンを終えたあとに相手が場のキャラクターで殴り返してくるところまで試してから、盤面の点数で選ぶ。
 * 相手の手札・山札の中身は見ない（殴り返しは場のキャラクターだけで考える）。
 */

export interface SearchOptions {
  /** 各段で残す候補の数 */
  beam: number;
  /** 1ターンで試す操作の数の上限（重くなりすぎないように） */
  maxNodes: number;
  /** 相手の殴り返しまで試す、終わり方の候補の数 */
  finalists: number;
  /** 考える時間の上限（ミリ秒）。遅いスマホでも画面が固まりすぎないように */
  timeLimitMs: number;
  /** 考えた中身を受け取る（対戦の記録に残して、あとで CPU の悪手を調べるため） */
  onThink?: (t: CpuThought) => void;
}

/** CPU が1ターン分を考えた中身：最後に比べた候補（点数の高い順）と、選んだ候補 */
export interface CpuThought {
  /** 構え（大きいほど相手のプレイヤーを攻める） */
  bias: number;
  /** 試した操作の数 */
  nodes: number;
  /** 比べた候補。now はそのターンの終わりの盤面の点数、reply は相手の殴り返しまで読んだ点数、total は比べた値 */
  options: { actions: Action[]; now: number; reply: number; total: number }[];
  /** 選んだ候補（options の何番目か）。勝ちが見えて先に決めたときは -1 */
  chosen: number;
  /** 勝ちが見えて先に決めた手 */
  win?: Action[];
}

/** 記録に残す候補の数（多すぎると記録が重くなる） */
const THOUGHT_OPTIONS = 5;

export const DEFAULT_SEARCH: SearchOptions = { beam: 20, maxNodes: 8000, finalists: 30, timeLimitMs: 400 };

/** 盤面の点数の重み（シミュレーションで調整した値） */
export const WEIGHTS = {
  life: 1.2,
  lowLife: 0.8,
  attack: 1.3,
  hp: 0.9,
  guard: 1.5,
  hand: 1.4,
  lasting: 2.5,
  now: 0.15,
  focus: 1,
  /** 残っているバズ1回の価値（これより得をする場面でだけ使う） */
  buzz: 4,
  /** 攻める側（殴り合いで先に削り切れる）のとき、相手のライフを削る点を何倍に見るか */
  faceBias: 1.5,
};

/**
 * このターンの構え。殴り合いで先に削り切れそう（盤面の攻撃力で相手のライフを削るターン数が、相手より少ない）か、
 * 次の自分のターンまでに削り切れそうなら「攻める」：相手のプレイヤーを殴る点を重く見る（10月25日、オーナー：
 * 「体力、盤面的に有利な場合には積極的に顔を殴る」）。そうでなければ、盤面を取ることを優先する
 */
export function faceBiasOf(state: GameState, player: PlayerId, catalog: Catalog): number {
  const foeId = opponent(player);
  const power = (pid: PlayerId) =>
    state.players[pid].field.reduce((n, u) => (u ? n + viewUnit(state, pid, u, catalog).attack : n), 0);
  const mine = power(player);
  const theirs = power(foeId);
  if (mine <= 0) return 1;
  const foeLp = state.players[foeId].lp;
  const myClock = Math.ceil(foeLp / mine);
  const foeClock = theirs > 0 ? Math.ceil(state.players[player].lp / theirs) : Number.POSITIVE_INFINITY;
  return myClock < foeClock || foeLp <= mine * 2 ? WEIGHTS.faceBias : 1;
}

const WIN = 1_000_000;

/** ライフの価値。少ないほど1点が重い */
const lifeValue = (lp: number) => Math.max(lp, 0) + Math.min(Math.max(lp, 0), 10) * WEIGHTS.lowLife;

function unitValue(state: GameState, owner: PlayerId, slot: number, catalog: Catalog): number {
  const u = state.players[owner].field[slot];
  if (!u) return 0;
  const v = viewUnit(state, owner, u, catalog);
  const card = catalog[u.cardId];
  let value = 1 + v.attack * WEIGHTS.attack + v.hp * WEIGHTS.hp;
  if (v.guard) value += WEIGHTS.guard + v.hp * 0.3;
  if (v.keywords.includes("連撃")) value += v.attack * 0.7;
  if (v.keywords.includes("注目")) value += (slot === CENTER_SLOT ? 2 : 1) * WEIGHTS.focus;
  if (v.keywords.includes("突進")) value += 0.3;
  if (!u.silenced && card) {
    const lasting = card.effects.some((e) => {
      return e.on === "passive" || e.on === "turnEnd";
    });
    if (lasting) value += WEIGHTS.lasting;
  }
  if (v.asleep) value -= v.attack * 0.5;
  return value;
}

/** 盤面の点数（player から見て。高いほど良い） */
export function evaluate(state: GameState, player: PlayerId, catalog: Catalog, faceBias = 1): number {
  if (state.winner) return state.winner === player ? WIN : -WIN;
  const foeId = opponent(player);
  const me = state.players[player];
  const foe = state.players[foeId];
  // プレイヤーに付いた「次の自分のターンの終わりにダメージを受ける」効果は、もう減ったライフとして見る
  let score =
    (lifeValue(me.lp - delayedDamageOn(state, player)) -
      lifeValue(foe.lp - delayedDamageOn(state, foeId)) * faceBias) *
    WEIGHTS.life;
  for (let s = 0; s < me.field.length; s++) score += unitValue(state, player, s, catalog);
  for (let s = 0; s < foe.field.length; s++) score -= unitValue(state, foeId, s, catalog);
  score += (me.hand.length - foe.hand.length) * WEIGHTS.hand;
  // 裏向きのカード（次のターンの始めに闇堕ちして戻ってくる）は、コストなしで出せる手札のようなもの
  score += (darkOmens(state, player).length - darkOmens(state, foeId).length) * 3 * WEIGHTS.hand;
  // バズは残しておくほど後で使える
  score += ((me.buzzLeft ?? 0) - (foe.buzzLeft ?? 0)) * WEIGHTS.buzz;
  // 山札切れが近いと危ない（陰謀論者が場にいれば、次のターンの始めに勝つ）
  const safe = (pid: PlayerId) =>
    state.players[pid].field.some((u) => u && hasPassive(u, "conspiracyWin", catalog));
  if (me.deck.length === 0 && !safe(player)) score -= 6;
  // 陰謀論者：山札が少ないほど特殊勝利に近い。相手の陰謀論者は早く破壊したい
  const plot = (pid: PlayerId) =>
    state.players[pid].field.some((u) => u && hasPassive(u, "conspiracyWin", catalog))
      ? 40 / (1 + state.players[pid].deck.length)
      : 0;
  score += plot(player) - plot(foeId);
  return score;
}

/**
 * 差し出し待ち（フィクサー）を、読みのためだけに片付けた盤面。待っている人は autoSacrifice で選んだことにする
 */
function settle(state: GameState, catalog: Catalog): GameState {
  let s = state;
  for (let i = 0; i < 2 && s.pending; i++) {
    const pid = s.pending.waiting[0];
    if (!pid) break;
    s = applyAction(
      s,
      { type: "sacrifice", player: pid, slot: autoSacrifice(s, pid, catalog) },
      catalog,
    ).state;
  }
  return s;
}

/** 試す操作の一覧（同じカードの重複や、意味の同じ枠は省く） */
function candidates(state: GameState, player: PlayerId, catalog: Catalog): Action[] {
  // 差し出し待ち：自分が選ぶ番なら差し出す候補だけ。相手が選ぶ番なら、ここで手を止める
  if (state.pending) {
    if (!state.pending.waiting.includes(player)) return [];
    return sacrificeCandidates(state, player).map((slot) => ({ type: "sacrifice" as const, player, slot }));
  }
  const me = state.players[player];
  const out: Action[] = [];
  const empty = openSlots(state, player);
  const slots = [
    ...new Set([empty.includes(CENTER_SLOT) ? CENTER_SLOT : -1, empty[0] ?? -1, empty.at(-1) ?? -1]),
  ].filter((s) => s >= 0);
  const seen = new Set<string>();
  me.hand.forEach((id, handIndex) => {
    if (seen.has(id)) return;
    seen.add(id);
    const card = catalog[id];
    if (!card || effectiveCost(state, player, id, catalog) > me.mana) return;
    if (card.type === "icon") {
      for (const slot of slots) out.push({ type: "play", player, handIndex, slot });
    } else if (card.target) {
      for (const target of castTargets(state, player, id, catalog))
        out.push({ type: "cast", player, handIndex, target });
    } else out.push({ type: "cast", player, handIndex });
  });
  // バズは、使っても殴れないキャラクター（攻撃し終えた・眠り状態）には試さない
  if (!buzzBlock(state, player))
    me.field.forEach((u, slot) => {
      if (u && buzzValue(state, player, slot, catalog) > 0) out.push({ type: "buzz", player, slot });
    });
  me.field.forEach((u, from) => {
    if (!u || !canUnitAttack(state, u)) return;
    for (const target of attackTargets(state, player, from, catalog))
      out.push({ type: "attack", player, from, target });
  });
  return out;
}

/** 似た盤面をまとめるための目印 */
function signature(state: GameState): string {
  const f = (p: PlayerId) =>
    state.players[p].field
      .map((u) =>
        u
          ? `${u.cardId}.${u.damage}.${u.attacksLeft}.${u.atkBuff}.${u.hpBuff}.${+u.dark}.${+!!u.exposed}.${+!!u.exposeAtTurnEnd}.${+!!u.rushOnly}`
          : "_",
      )
      .join(",");
  const me = state.players[state.active];
  return `${state.players.p1.lp}|${state.players.p2.lp}|${me.mana}|${me.hand.join(",")}|${me.trash.length}|${f("p1")}|${f("p2")}|${state.winner}`;
}

/**
 * 置いた枠の場所だけが違う盤面をまとめる目印（場のキャラクターを並べ替えて比べる）。
 * 2枚出すと、場所と出す順の組み合わせで同じ中身の盤面がいくつもでき、残す候補がそれで埋まっていた（10月26日、docs/cpu-logs.md）
 */
function looseSignature(state: GameState): string {
  const f = (p: PlayerId) =>
    state.players[p].field
      .flatMap((u) =>
        u
          ? [`${u.cardId}.${u.damage}.${u.attacksLeft}.${u.atkBuff}.${u.hpBuff}.${+u.dark}.${+!!u.exposed}`]
          : [],
      )
      .sort()
      .join(",");
  const me = state.players[state.active];
  return `${state.players.p1.lp}|${state.players.p2.lp}|${me.mana}|${me.hand.join(",")}|${me.trash.length}|${f("p1")}|${f("p2")}|${state.winner}`;
}

interface Node {
  state: GameState;
  actions: Action[];
  score: number;
}

/** 点数の高い順に n 個。中身が同じ盤面（置いた場所だけが違う）は、いちばん点数の高い1つだけ */
function distinctBest(list: Iterable<Node>, n: number): Node[] {
  const seen = new Set<string>();
  const out: Node[] = [];
  for (const x of [...list].sort((a, b) => b.score - a.score)) {
    const k = looseSignature(x.state);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

/** ターンを終えて、相手が場のキャラクターだけで殴り返したあとの盤面の点数 */
function scoreAfterReply(node: Node, player: PlayerId, catalog: Catalog, faceBias: number): number {
  const settled = settle(node.state, catalog);
  if (settled.winner) return evaluate(settled, player, catalog, faceBias);
  let s = applyAction(settled, { type: "endTurn", player }, catalog).state;
  if (s.winner || s.active === player) return evaluate(s, player, catalog, faceBias); // 追加ターンなど
  const foeId = opponent(player);
  // 相手の手札は分からないので、空にして「攻撃だけ」させる
  s = { ...s, players: { ...s.players, [foeId]: { ...s.players[foeId], hand: [] } } };
  try {
    for (const a of planTurn(s, foeId, catalog)) {
      if (a.type === "endTurn") break;
      s = applyAction(s, a, catalog).state;
      if (s.winner) break;
    }
  } catch {
    // 読み違いは気にしない
  }
  return evaluate(s, player, catalog, faceBias);
}

export function planTurnSearch(
  start: GameState,
  player: PlayerId,
  catalog: Catalog,
  options: Partial<SearchOptions> = {},
): Action[] {
  // 闇堕ちさせられる裏向きのカードがあれば、まず闇堕ちさせる（1 手ずつ返し、闇堕ちしたあとの盤面で考え直す）
  const fall = darkFallSlots(start, player)[0];
  if (fall !== undefined) return [{ type: "darkFall", player, slot: fall }];
  const opt = { ...DEFAULT_SEARCH, ...options };
  // 構え（攻めるか、盤面を取るか）はターンの初めの盤面で決める
  const bias = faceBiasOf(start, player, catalog);
  const root: Node = { state: start, actions: [], score: evaluate(start, player, catalog, bias) };
  const all = new Map<string, Node>([[signature(start), root]]);
  let frontier = [root];
  let nodes = 0;
  const deadline = Date.now() + opt.timeLimitMs;

  // これまでの CPU（貪欲法）の手も候補に入れる（少なくともそれより悪くならないように）
  try {
    let s = start;
    const acts: Action[] = [];
    for (const a of planTurn(start, player, catalog)) {
      if (a.type === "endTurn") break;
      s = applyAction(s, a, catalog).state;
      acts.push(a);
    }
    all.set(`greedy:${signature(s)}`, { state: s, actions: acts, score: evaluate(s, player, catalog, bias) });
  } catch {
    // 使えなければ探索だけで決める
  }

  while (frontier.length > 0 && nodes < opt.maxNodes && Date.now() <= deadline) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (node.state.winner) continue;
      for (const a of candidates(node.state, player, catalog)) {
        if (nodes >= opt.maxNodes || (nodes % 64 === 0 && Date.now() > deadline)) break;
        nodes++;
        let state: GameState;
        try {
          state = applyAction(node.state, a, catalog).state;
        } catch {
          continue;
        }
        const sig = signature(state);
        if (all.has(sig)) continue;
        const child: Node = {
          state,
          actions: [...node.actions, a],
          score: evaluate(state.pending ? settle(state, catalog) : state, player, catalog, bias),
        };
        all.set(sig, child);
        if (state.winner === player) {
          opt.onThink?.({ bias, nodes, options: [], chosen: -1, win: [...child.actions] });
          return [...child.actions];
        }
        next.push(child);
      }
    }
    frontier = distinctBest(next, opt.beam);
  }

  const finalists = distinctBest(all.values(), opt.finalists);
  let best = finalists[0] ?? root;
  let bestScore = Number.NEGATIVE_INFINITY;
  const compared: CpuThought["options"] = [];
  for (const n of finalists) {
    const reply = scoreAfterReply(n, player, catalog, bias);
    const s = reply + n.score * WEIGHTS.now;
    compared.push({ actions: n.actions, now: n.score, reply, total: s });
    if (s > bestScore) {
      bestScore = s;
      best = n;
    }
  }
  if (opt.onThink) {
    const ranked = compared.map((c, i) => ({ c, i })).sort((a, b) => b.c.total - a.c.total);
    const chosen = finalists.indexOf(best);
    const top = ranked.slice(0, THOUGHT_OPTIONS);
    if (chosen >= 0 && !top.some((r) => r.i === chosen))
      top.push(ranked.find((r) => r.i === chosen) as (typeof ranked)[number]);
    opt.onThink({
      bias,
      nodes,
      options: top.map((r) => ({ ...r.c, actions: [...r.c.actions] })),
      chosen: top.findIndex((r) => r.i === chosen),
    });
  }
  // 相手の差し出しを待つところで終わる手なら、ターン終了は付けない（相手が選んだあとに考え直す）
  if (best.state.pending) return [...best.actions];
  return [...best.actions, { type: "endTurn", player }];
}
