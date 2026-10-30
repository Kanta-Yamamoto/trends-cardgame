import type { GameEvent, PlayerId, Unit } from "@trends/game-core";

/**
 * 場に出たキャラクターを、出来事 events の from 番目からあとの強化（buffed）を引いた姿にする。
 * 出した・効果で出た・闇堕ちしたキャラクターを、効果を見せる前に画面へ置くときに使う。
 * 置いた時点で強化後の数字だと、あとから出る「+N」が何の強化か分からないため、数字は「+N」を見せてから上げる（10月30日）。
 * 同じ枠のキャラクターがいなくなったら（破壊・手札に戻る・差し出し）、そこから先は別のキャラクターなので数えない
 */
export function beforeBuffs(unit: Unit, player: PlayerId, slot: number, events: GameEvent[], from = 0): Unit {
  let attack = 0;
  let hp = 0;
  for (let i = from; i < events.length; i++) {
    const e = events[i];
    if (!e || !("player" in e) || e.player !== player || !("slot" in e) || e.slot !== slot) continue;
    if (e.type === "destroyed" || e.type === "bounced" || e.type === "sacrificed") break;
    if (e.type === "buffed" && e.cardId === unit.cardId) {
      attack += e.attack;
      hp += e.hp;
    }
  }
  if (attack === 0 && hp === 0) return unit;
  return { ...unit, atkBuff: unit.atkBuff - attack, hpBuff: unit.hpBuff - hp };
}
