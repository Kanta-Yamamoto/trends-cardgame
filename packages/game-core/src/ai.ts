import {
  applyAction,
  attackTargets,
  canUnitAttack,
  castTargets,
  darkReady,
  effectiveCost,
  isShielded,
  opponent,
  viewUnit,
} from "./engine";
import type { Action, CastTarget, GameState, PlayerId, RuleCard, UnitView } from "./types";

type Catalog = Record<string, RuleCard>;

const worth = (v: UnitView) => v.attack + v.hp;

function views(state: GameState, owner: PlayerId, catalog: Catalog) {
  return state.players[owner].field.flatMap((u, slot) =>
    u ? [{ slot, v: viewUnit(state, owner, u, catalog) }] : [],
  );
}

/** 投稿をいつ・誰に使うか。使う価値が無ければ null */
function judgePost(
  state: GameState,
  player: PlayerId,
  cardId: string,
  catalog: Catalog,
): { score: number; target?: CastTarget } | null {
  const card = catalog[cardId];
  if (!card) return null;
  const foeId = opponent(player);
  const mine = views(state, player, catalog);
  const foes = views(state, foeId, catalog);
  const ready = mine.filter((x) => canUnitAttack(state, x.v.unit));
  const effects = card.effects.map((e) => e.do);
  const enemy = (slot: number): CastTarget => ({ side: "enemy", slot });

  const dmg = (to: string) =>
    (
      card.effects.find((e) => e.do === "damage" && "to" in e && e.to === to) as
        | { amount: number }
        | undefined
    )?.amount ?? 0;
  if (dmg("enemyMaster") > 0) {
    const n = dmg("enemyMaster");
    const lethal = state.players[foeId].lp <= n;
    return { score: lethal ? 100 : 4 + n };
  }
  if (dmg("allEnemies") > 0) {
    const n = dmg("allEnemies");
    const kills = foes.filter((x) => x.v.hp <= n).reduce((s, x) => s + worth(x.v), 0);
    const score = kills + foes.length;
    return score >= 4 ? { score } : null;
  }
  if (effects.includes("buffAllies")) {
    return mine.length >= 2 ? { score: mine.length * 4 } : null;
  }
  if (effects.includes("summon")) {
    const empty = state.players[player].field.filter((u) => !u).length;
    return empty >= 1 ? { score: Math.min(empty, 2) * 4 + (effects.includes("draw") ? 3 : 0) } : null;
  }
  if (effects.includes("drawPerAllies")) {
    const fx = card.effects.find((e) => e.do === "drawPerAllies") as { per: number; max: number } | undefined;
    const n = fx ? Math.min(fx.max, Math.floor(mine.length / fx.per)) : 0;
    return n >= 2 ? { score: 3 * n } : null;
  }
  if (
    (effects.includes("destroy") ||
      effects.includes("bounce") ||
      effects.includes("steal") ||
      effects.includes("transform")) &&
    card.target === "enemyIcon"
  ) {
    // 確定除去・手札に戻す：使える相手の中でいちばん価値の高いアイコンに。安いアイコンには使わない
    const legal = new Set(castTargets(state, player, cardId, catalog).map((t) => t.slot));
    const t = foes.filter((x) => legal.has(x.slot)).sort((a, b) => worth(b.v) - worth(a.v))[0];
    if (!t) return null;
    const value = worth(t.v) + (t.v.guard ? 3 : 0) + (t.v.unit.dark ? 4 : 0);
    const need = effects.includes("bounce") ? 6 : 5;
    return value >= need ? { score: 12 + value, target: enemy(t.slot) } : null;
  }
  if (effects.includes("damage") && card.target === "enemyIcon") {
    const amount = card.effects.find((e) => e.do === "damage" && "amount" in e) as
      | { amount: number }
      | undefined;
    const dmg = amount?.amount ?? 0;
    const kill = foes.filter((x) => x.v.hp <= dmg).sort((a, b) => worth(b.v) - worth(a.v))[0];
    if (kill) return { score: 20 + worth(kill.v), target: enemy(kill.slot) };
    const big = foes.sort((a, b) => b.v.attack - a.v.attack)[0];
    return big ? { score: 6, target: enemy(big.slot) } : null;
  }
  if (effects.includes("expose")) {
    // 晒すと強化が消える：強化を重ねた相手がいれば狙う
    const buffed = foes
      .map((x) => ({ x, b: Math.max(0, x.v.unit.atkBuff) + Math.max(0, x.v.unit.hpBuff) }))
      .sort((a, b) => b.b - a.b)[0];
    if (buffed && buffed.b >= 2) return { score: 8 + buffed.b * 3, target: enemy(buffed.x.slot) };
    // 晒すとガードを失う：ガードが1体だけなら、晒せばマスターまで通る
    const guards = foes.filter((x) => x.v.guard);
    const only = guards.length === 1 ? guards[0] : undefined;
    if (only && ready.length > 0) return { score: 14, target: enemy(only.slot) };
    const t = guards.sort((a, b) => worth(b.v) - worth(a.v))[0] ?? foes.filter((x) => !x.v.exposed)[0];
    return t ? { score: guards.length > 0 ? 6 : 2, target: enemy(t.slot) } : null;
  }
  if (effects.includes("bind")) {
    const t = foes.filter((x) => !x.v.asleep).sort((a, b) => b.v.attack - a.v.attack)[0];
    return t && t.v.attack >= 2 ? { score: t.v.attack * 4, target: enemy(t.slot) } : null;
  }
  if (effects.includes("silence")) {
    const guard = foes.filter((x) => x.v.guard).sort((a, b) => b.v.hp - a.v.hp)[0];
    if (guard && ready.length > 0) return { score: 18, target: enemy(guard.slot) };
    const t = foes
      .filter((x) => x.v.keywords.length > 0 || x.v.unit.dark)
      .sort((a, b) => worth(b.v) - worth(a.v))[0];
    return t ? { score: t.v.attack * 3, target: enemy(t.slot) } : null;
  }
  if ((effects.includes("buff") || effects.includes("hype")) && card.target === "allyIcon") {
    // このターンだけの強化（炎上商法）は、今攻撃できるアイコンにしか意味がない
    const temporary = card.effects.some((e) => e.do === "hype");
    if (temporary && ready.length === 0) return null;
    const legal = new Set(castTargets(state, player, cardId, catalog).map((t) => t.slot));
    const pool = (ready.length > 0 ? ready : mine).filter((x) => legal.has(x.slot));
    const t = (pool.length > 0 ? pool : mine.filter((x) => legal.has(x.slot))).sort(
      (a, b) => b.v.attack - a.v.attack,
    )[0];
    return t ? { score: 10, target: { side: "ally", slot: t.slot } } : null;
  }
  if (effects.includes("totonou") && card.target === "allyIcon") {
    // 整う：熱（2ダメージ）に耐えられる、体力の多いアイコンに
    const legal = new Set(castTargets(state, player, cardId, catalog).map((t) => t.slot));
    const t = mine.filter((x) => legal.has(x.slot) && x.v.hp >= 4).sort((a, b) => b.v.hp - a.v.hp)[0];
    return t ? { score: 8, target: { side: "ally", slot: t.slot } } : null;
  }
  if (effects.includes("fill")) {
    const empty = state.players[player].field.filter((u) => !u).length;
    return empty >= 2 ? { score: empty * 4 } : null;
  }
  if (effects.includes("cleanse")) {
    const foeDark = foes.filter((x) => x.v.unit.dark).length;
    const foeBuff = foes.reduce((s, x) => s + Math.max(0, x.v.unit.atkBuff) + x.v.unit.hpBuff, 0);
    const onlyFoes = card.effects.some((e) => e.do === "cleanse" && e.to === "allEnemies");
    const myBuff = onlyFoes
      ? 0
      : mine.reduce((s, x) => s + Math.max(0, x.v.unit.atkBuff) + x.v.unit.hpBuff, 0);
    // 相手を眠らせていたら、起こしてしまう分を引く
    const foeAsleep = foes.filter((x) => x.v.asleep).reduce((s, x) => s + x.v.attack, 0);
    const score = foeDark * 15 + foeBuff * 2 - myBuff * 2 - foeAsleep * 2;
    return score >= 8 ? { score } : null;
  }
  if (effects.includes("heal")) {
    const missing = mine.reduce((s, x) => s + x.v.unit.damage, 0);
    const lpMissing = 20 - state.players[player].lp;
    const score = missing + Math.min(3, lpMissing);
    return score >= 5 ? { score } : null;
  }
  if (effects.includes("weaken")) {
    const t = foes.sort((a, b) => b.v.attack - a.v.attack)[0];
    return t && t.v.attack >= 2 ? { score: 4 + t.v.attack * 2, target: enemy(t.slot) } : null;
  }
  return effects.includes("draw") || effects.includes("tutor")
    ? { score: 3, target: fallbackTarget() }
    : null;

  /** 対象が要るのに決めていない投稿は、いちばん強い相手（味方向けなら、いちばん強い味方）に使う */
  function fallbackTarget(): CastTarget | undefined {
    if (!card?.target) return undefined;
    if (card.target === "enemyIcon") {
      const t = [...foes].sort((a, b) => worth(b.v) - worth(a.v))[0];
      return t ? enemy(t.slot) : undefined;
    }
    const legal = new Set(castTargets(state, player, cardId, catalog).map((x) => x.slot));
    const t = mine.filter((x) => legal.has(x.slot)).sort((a, b) => worth(b.v) - worth(a.v))[0];
    return t ? { side: "ally", slot: t.slot } : undefined;
  }
}

/**
 * CPU の1ターン分の操作を決める（貪欲法）。
 * 1. 出せるアイコン・使う価値のある投稿を、価値の高い順に使う
 * 2. 攻撃できるアイコンで、とどめ → 一方的に倒せる相手 → 得な相打ち → マスター の順に攻撃する
 * 3. ターン終了
 * 返す操作は順に applyAction すればそのまま合法になる。
 */
export function planTurn(start: GameState, player: PlayerId, catalog: Catalog): Action[] {
  const actions: Action[] = [];
  let state = start;
  const step = (a: Action) => {
    state = applyAction(state, a, catalog).state;
    actions.push(a);
  };
  const foeId = opponent(player);

  // 1. 出す・使う
  for (let guard = 0; guard < 20; guard++) {
    if (state.winner) return actions;
    const me = state.players[player];
    const slot = me.field.findIndex((u) => !u);
    let best: { score: number; action: Action } | null = null;
    me.hand.forEach((id, handIndex) => {
      const card = catalog[id];
      if (!card) return;
      const cost = effectiveCost(state, player, id, catalog);
      if (cost > me.mana) return;
      if (card.type === "icon") {
        if (slot < 0) return;
        // 注目のアイコンは真ん中の枠を優先する
        const wantsCenter = card.keywords.includes("注目") || card.effects.some((e) => e.do === "focusAura");
        const center = wantsCenter && !me.field[2] ? 2 : slot;
        let score = card.cost * 10 + (card.attack ?? 0) + (card.hp ?? 0);
        // 場のアイコンが多いほど安く・強くなるカードは、ほかを出してから
        if (card.effects.some((e) => e.do === "cheaperPerAlly")) {
          const others = me.field.filter((u) => u).length;
          if (others < 3 && me.hand.length > 1) score -= 100;
        }
        if (!best || score > best.score)
          best = { score, action: { type: "play", player, handIndex, slot: center } };
      } else {
        if (card.target && castTargets(state, player, id, catalog).length === 0) return;
        const j = judgePost(state, player, id, catalog);
        if (!j || (card.target && !j.target)) return;
        const score = j.score + card.cost * 2;
        if (!best || score > best.score) {
          best = { score, action: { type: "cast", player, handIndex, target: j.target } };
        }
      }
    });
    // 闇堕ち：オワコンに闇堕ちできるカードがあれば、コストなしなので出す（相手の場にアイコンがいるときに。蘇生する闇堕ちは相手の場が空でも）
    const ready = slot >= 0 ? darkReady(state, player, catalog) : [];
    const darkId = ready[0];
    const revives = catalog[darkId ?? ""]?.dark?.effects?.some((e) => e.do === "revive") ?? false;
    if (darkId !== undefined && (revives || state.players[foeId].field.some((u) => u))) {
      best = { score: 999, action: { type: "darkFall", player, cardId: darkId, slot } };
    }
    if (!best) break;
    step((best as { action: Action }).action);
  }

  // 2. 攻撃
  for (let guard = 0; guard < 20; guard++) {
    if (state.winner) return actions;
    const mine = views(state, player, catalog).filter((x) => canUnitAttack(state, x.v.unit));
    if (mine.length === 0) break;
    mine.sort((a, b) => b.v.attack - a.v.attack);
    const foe = state.players[foeId];
    const readyAttack = mine.reduce((s, x) => s + x.v.attack * x.v.unit.attacksLeft, 0);
    let acted = false;
    let anyFace = false;
    let targets = attackTargets(state, player, mine[0]?.slot ?? 0, catalog);
    for (const { slot: from, v } of mine) {
      targets = attackTargets(state, player, from, catalog);
      // マスターが守られている間は、殴っても意味がない
      const canFace = !isShielded(state, foeId) && targets.some((t) => t.kind === "leader");
      anyFace ||= canFace;
      if (canFace && foe.lp <= readyAttack) {
        step({ type: "attack", player, from, target: { kind: "leader" } });
        acted = true;
        break;
      }
      let best: { slot: number; score: number } | null = null;
      for (const t of targets) {
        if (t.kind !== "unit") continue;
        const d = foe.field[t.slot];
        if (!d) continue;
        const dv = viewUnit(state, foeId, d, catalog);
        const dmg = v.attack;
        const kills = dmg >= dv.hp;
        const survives = dv.attack < v.hp;
        let score: number;
        if (kills && survives) score = 10 + worth(dv);
        else if (kills) score = worth(dv) - worth(v);
        else if (survives) score = canFace ? -1 : dmg;
        else score = -99;
        if (!best || score > best.score) best = { slot: t.slot, score };
      }
      const threat = best ? foe.field[best.slot] : null;
      const threatAtk = threat ? viewUnit(state, foeId, threat, catalog).attack : 0;
      if (best && best.score >= 10 && (!canFace || threatAtk >= 2)) {
        step({ type: "attack", player, from, target: { kind: "unit", slot: best.slot } });
      } else if (canFace) {
        step({ type: "attack", player, from, target: { kind: "leader" } });
      } else if (best && best.score >= 0) {
        step({ type: "attack", player, from, target: { kind: "unit", slot: best.slot } });
      } else continue;
      acted = true;
      break; // 盤面が変わったので選び直す
    }
    if (!acted && !anyFace) {
      // ガードに阻まれているとき：全員でかかれば倒せるなら、弱いアイコンから削りに行く
      const guards = targets
        .flatMap((t) => {
          if (t.kind !== "unit") return [];
          const u = foe.field[t.slot];
          return u ? [{ slot: t.slot, v: viewUnit(state, foeId, u, catalog) }] : [];
        })
        .sort((a, b) => a.v.hp - b.v.hp);
      const g = guards.find((x) => x.v.hp <= readyAttack);
      if (g) {
        const weakest = [...mine].sort((a, b) => worth(a.v) - worth(b.v))[0];
        if (weakest) {
          step({ type: "attack", player, from: weakest.slot, target: { kind: "unit", slot: g.slot } });
          acted = true;
        }
      }
    }
    if (!acted) break;
  }

  if (!state.winner) step({ type: "endTurn", player });
  return actions;
}
