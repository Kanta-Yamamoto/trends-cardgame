import { opponent } from "./abilities";
import { applyAction, effectiveCost, hpLeft, legalTargets } from "./engine";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

/** アイコンの価値の目安（攻撃力＋体力） */
const worth = (c: RuleCard | undefined) => (c ? c.attack + c.hp : 0);

/**
 * CPU の1ターン分の操作を決める（貪欲法）。
 * 1. 出せる中で一番重いアイコンから、空いた枠に出す
 * 2. 攻撃できるアイコンごとに、とどめ → 一方的に倒せる相手 → 得な相打ち → マスター の順で選ぶ
 *    （ガードがいてマスターを攻撃できないときは、ガードを削る）
 * 3. ターン終了
 * 返す操作は順に applyAction すればそのまま合法になる。
 */
export function planTurn(start: GameState, player: PlayerId, catalog: Record<string, RuleCard>): Action[] {
  const actions: Action[] = [];
  let state = start;
  const step = (a: Action) => {
    state = applyAction(state, a, catalog).state;
    actions.push(a);
  };
  const foeId = opponent(player);

  // 出す
  for (;;) {
    if (state.winner) return actions;
    const me = state.players[player];
    const slot = me.field.findIndex((u) => !u);
    if (slot < 0) break;
    const pick = me.hand
      .map((id, handIndex) => ({ id, handIndex, cost: effectiveCost(state, player, id, catalog) }))
      .filter((c) => c.cost <= me.mana)
      .sort((a, b) => b.cost - a.cost || worth(catalog[b.id]) - worth(catalog[a.id]))[0];
    if (!pick) break;
    step({ type: "play", player, handIndex: pick.handIndex, slot });
  }

  // 攻撃（攻撃力の高い順）
  const order = state.players[player].field
    .map((u, from) => ({ u, from }))
    .filter((x) => x.u?.canAttack)
    .sort((a, b) => (catalog[b.u?.cardId ?? ""]?.attack ?? 0) - (catalog[a.u?.cardId ?? ""]?.attack ?? 0));

  for (const { from } of order) {
    if (state.winner) return actions;
    const u = state.players[player].field[from];
    if (!u?.canAttack) continue;
    const card = catalog[u.cardId];
    if (!card) continue;
    const myLeft = hpLeft(u, catalog);
    const foe = state.players[foeId];
    const targets = legalTargets(state, player, catalog);
    const canFace = targets.some((t) => t.kind === "leader");

    // マスターを攻撃できて、場の攻撃力の合計でライフを削り切れるなら全員マスターへ
    const readyAttack = state.players[player].field.reduce(
      (sum, x) => sum + (x?.canAttack ? (catalog[x.cardId]?.attack ?? 0) : 0),
      0,
    );
    if (canFace && foe.lp <= readyAttack) {
      step({ type: "attack", player, from, target: { kind: "leader" } });
      continue;
    }

    let best: { slot: number; score: number } | null = null;
    for (const t of targets) {
      if (t.kind !== "unit") continue;
      const d = foe.field[t.slot];
      const dc = d ? catalog[d.cardId] : undefined;
      if (!d || !dc) continue;
      const kills = card.attack >= hpLeft(d, catalog);
      const survives = dc.attack < myLeft;
      let score: number;
      if (kills && survives) score = 10 + worth(dc);
      else if (kills) score = worth(dc) - worth(card);
      else if (survives)
        score = canFace ? -1 : card.attack; // 倒せないが削れる（ガード相手のとき）
      else score = -99;
      if (!best || score > best.score) best = { slot: t.slot, score };
    }

    const threat = best ? catalog[foe.field[best.slot]?.cardId ?? ""] : undefined;
    if (best && best.score >= 10 && (!canFace || (threat?.attack ?? 0) >= 2)) {
      step({ type: "attack", player, from, target: { kind: "unit", slot: best.slot } });
    } else if (canFace) {
      step({ type: "attack", player, from, target: { kind: "leader" } });
    } else if (best && best.score >= 0) {
      step({ type: "attack", player, from, target: { kind: "unit", slot: best.slot } });
    }
  }

  if (!state.winner) step({ type: "endTurn", player });
  return actions;
}
