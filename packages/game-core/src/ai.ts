import { opponent } from "./abilities";
import { applyAction, effectiveCost, legalTargets } from "./engine";
import type { Action, GameState, PlayerId, RuleCard } from "./types";

/**
 * CPU の1ターン分の操作を決める（貪欲法）。
 * 1. 出せる中で一番重いカードから、空いた枠に出す
 * 2. 攻撃できるカードは、相打ちせずに倒せる一番強い相手カード → なければ本体 → ガードしかなければ倒せるガードへ
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

  // 出す
  for (;;) {
    if (state.winner) return actions;
    const me = state.players[player];
    const slot = me.field.findIndex((u) => !u);
    if (slot < 0) break;
    const playable = me.hand
      .map((id, handIndex) => ({ id, handIndex, cost: effectiveCost(state, player, id, catalog) }))
      .filter((c) => c.cost <= me.mana)
      .sort((a, b) => b.cost - a.cost || (catalog[b.id]?.power ?? 0) - (catalog[a.id]?.power ?? 0));
    const pick = playable[0];
    if (!pick) break;
    step({ type: "play", player, handIndex: pick.handIndex, slot });
  }

  // 攻撃
  for (let from = 0; from < state.players[player].field.length; from++) {
    if (state.winner) return actions;
    const u = state.players[player].field[from];
    if (!u?.canAttack) continue;
    const power = catalog[u.cardId]?.power ?? 0;
    const foe = state.players[opponent(player)];
    const targets = legalTargets(state, player, catalog);
    const killable = targets
      .filter((t): t is { kind: "unit"; slot: number } => t.kind === "unit")
      .map((t) => ({ t, p: catalog[foe.field[t.slot]?.cardId ?? ""]?.power ?? 0 }))
      .filter((x) => x.p < power)
      .sort((a, b) => b.p - a.p);
    const leader = targets.find((t) => t.kind === "leader");
    // 本体を殴れば勝てるなら本体
    if (leader && foe.lp <= power) {
      step({ type: "attack", player, from, target: leader });
      continue;
    }
    const best = killable[0];
    if (best && (!leader || best.p >= power * 0.6)) step({ type: "attack", player, from, target: best.t });
    else if (leader) step({ type: "attack", player, from, target: leader });
    else if (best) step({ type: "attack", player, from, target: best.t });
  }

  if (!state.winner) step({ type: "endTurn", player });
  return actions;
}
