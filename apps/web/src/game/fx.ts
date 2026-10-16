import type { AttackTarget, GameState, PlayerId, RuleCard } from "@trends/game-core";
import { hpLeft } from "@trends/game-core";

/**
 * 対戦画面の演出（DOM を直接アニメーションさせる）。
 * ルールの結果は game-core が決め、ここは「見せ方」だけを担当する。
 * 要素は data 属性で探す：data-uid（場のアイコン）／data-master（マスター）／data-pile（山札・トラッシュ）／data-hand（手札）
 */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canAnimate = () => typeof document !== "undefined" && typeof Element.prototype.animate === "function";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const q = (sel: string) => document.querySelector<HTMLElement>(sel);

function layer(): HTMLElement {
  let el = document.getElementById("fx-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-layer";
    document.body.appendChild(el);
  }
  return el;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** 数字が跳ねて消える（ダメージは赤、回復は緑） */
export function popNumber(target: HTMLElement | null, text: string, kind: "dmg" | "heal" = "dmg") {
  if (!target || !canAnimate()) return;
  const r = target.getBoundingClientRect();
  const c = center(r);
  const n = document.createElement("div");
  n.className = `fx-num ${kind}`;
  n.textContent = text;
  n.style.left = `${c.x}px`;
  n.style.top = `${c.y}px`;
  layer().appendChild(n);
  n.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
      { transform: "translate(-50%, -90%) scale(1.5)", opacity: 1, offset: 0.18 },
      { transform: "translate(-50%, -110%) scale(1)", opacity: 1, offset: 0.55 },
      { transform: "translate(-50%, -170%) scale(0.9)", opacity: 0 },
    ],
    { duration: reduced() ? 600 : 1100, easing: "cubic-bezier(.2,.8,.3,1)" },
  ).onfinish = () => n.remove();
}

/** 被弾：白く光って小刻みに揺れる */
function shake(el: HTMLElement | null, power = 1) {
  if (!el || reduced()) return;
  const p = 7 * power;
  el.animate(
    [
      { transform: "translate(0,0)", filter: "brightness(2.2)" },
      { transform: `translate(${-p}px, ${p * 0.4}px) rotate(-2deg)`, offset: 0.15 },
      { transform: `translate(${p * 0.8}px, ${-p * 0.3}px) rotate(1.5deg)`, offset: 0.35 },
      { transform: `translate(${-p * 0.5}px, 0) rotate(-1deg)`, filter: "brightness(1.2)", offset: 0.6 },
      { transform: "translate(0,0)", filter: "brightness(1)" },
    ],
    { duration: 380, easing: "ease-out" },
  );
}

/** 画面全体を軽く揺らす（マスターへの攻撃） */
function quake(power = 1) {
  const board = q(".board");
  if (!board || reduced()) return;
  const p = 6 * power;
  board.animate(
    [
      { transform: "translate(0,0)" },
      { transform: `translate(${p}px, ${-p}px)` },
      { transform: `translate(${-p}px, ${p * 0.6}px)` },
      { transform: `translate(${p * 0.5}px, ${p * 0.3}px)` },
      { transform: "translate(0,0)" },
    ],
    { duration: 320, easing: "ease-out" },
  );
}

/** 衝撃の輪 */
function burst(at: { x: number; y: number }, color: string) {
  const b = document.createElement("div");
  b.className = "fx-burst";
  b.style.left = `${at.x}px`;
  b.style.top = `${at.y}px`;
  b.style.setProperty("--c", color);
  layer().appendChild(b);
  b.animate(
    [
      { transform: "translate(-50%,-50%) scale(0.2)", opacity: 1 },
      { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 },
    ],
    { duration: 480, easing: "cubic-bezier(.1,.7,.3,1)" },
  ).onfinish = () => b.remove();
}

/** 倒されたアイコンの抜け殻を作り、トラッシュへ飛ばす（本体は React がすぐ消すため） */
function toTrash(el: HTMLElement | null, owner: PlayerId) {
  if (!el) return;
  const from = el.getBoundingClientRect();
  const pile = q(`[data-pile="trash-${owner}"]`)?.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add("fx-ghost");
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  layer().appendChild(ghost);
  const dx = pile ? center(pile).x - center(from).x : 0;
  const dy = pile ? center(pile).y - center(from).y : 40;
  const s = pile ? pile.width / from.width : 0.5;
  ghost.animate(
    [
      { transform: "none", filter: "grayscale(0) brightness(1)", opacity: 1 },
      {
        transform: "scale(1.06) rotate(-3deg)",
        filter: "grayscale(1) brightness(1.6)",
        opacity: 1,
        offset: 0.25,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(14deg)`,
        filter: "grayscale(1) brightness(.6)",
        opacity: 0.2,
      },
    ],
    { duration: 620, easing: "cubic-bezier(.5,0,.7,1)" },
  ).onfinish = () => ghost.remove();
}

/**
 * 攻撃の演出：溜め → 突進 → 衝撃（ダメージ表示・揺れ）→ 戻る。
 * 倒れる予定のアイコンはトラッシュへ飛ばす。resolve したら state を更新してよい。
 */
export async function animateAttack(
  game: GameState,
  player: PlayerId,
  from: number,
  target: AttackTarget,
  catalog: Record<string, RuleCard>,
): Promise<void> {
  if (!canAnimate() || reduced()) return;
  const foeId: PlayerId = player === "p1" ? "p2" : "p1";
  const atk = game.players[player].field[from];
  const atkCard = atk ? catalog[atk.cardId] : undefined;
  const atkEl = atk ? q(`[data-uid="${atk.uid}"]`) : null;
  const def = target.kind === "unit" ? game.players[foeId].field[target.slot] : null;
  const defCard = def ? catalog[def.cardId] : undefined;
  const defEl = def ? q(`[data-uid="${def.uid}"]`) : q(`[data-master="${foeId}"]`);
  if (!atk || !atkCard || !atkEl || !defEl) return;

  const a = atkEl.getBoundingClientRect();
  const d = defEl.getBoundingClientRect();
  const dx = (center(d).x - center(a).x) * 0.78;
  const dy = (center(d).y - center(a).y) * 0.78;
  const back = { x: -dx * 0.08, y: -dy * 0.08 };

  atkEl.style.zIndex = "6";
  const lunge = atkEl.animate(
    [
      { transform: "none" },
      {
        transform: `translate(${back.x}px, ${back.y}px) scale(1.08) rotate(-4deg)`,
        offset: 0.38,
        easing: "cubic-bezier(.6,0,.9,.4)",
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(1.12) rotate(3deg)`,
        offset: 0.58,
        easing: "cubic-bezier(.2,.8,.3,1)",
      },
      { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px) scale(1.04)`, offset: 0.66 },
      { transform: "none" },
    ],
    { duration: 820 },
  );

  // 突進が当たる瞬間
  await wait(820 * 0.58);
  const hit = center(d);
  burst(hit, "#ff5a4a");
  popNumber(defEl, `-${atkCard.attack}`);
  if (def && defCard) {
    shake(defEl, 1);
    if (defCard.attack > 0) {
      popNumber(atkEl, `-${defCard.attack}`);
    }
  } else {
    shake(defEl, 0.6);
    quake(Math.min(2, 0.6 + atkCard.attack / 4));
  }
  await lunge.finished.catch(() => {});
  atkEl.style.zIndex = "";

  // 倒れるものはトラッシュへ
  if (def && defCard && def.damage + atkCard.attack >= defCard.hp) toTrash(defEl, foeId);
  if (def && defCard && defCard.attack >= hpLeft(atk, catalog)) toTrash(atkEl, player);
  await wait(60);
}

/** 山札から1枚引く：裏向きのカードが山札から手札へ飛ぶ */
export async function animateDraw(player: PlayerId, delay = 0): Promise<void> {
  if (!canAnimate() || reduced()) return;
  const deck = q(`[data-pile="deck-${player}"] .cardback`) ?? q(`[data-pile="deck-${player}"]`);
  const handCards = document.querySelectorAll<HTMLElement>(`[data-hand="${player}"] [data-hand-card]`);
  const landing = handCards[handCards.length - 1] ?? q(`[data-hand="${player}"]`);
  if (!deck || !landing) return;
  const isMine = player === "p1" && handCards.length > 0;
  // 引いたカードは飛んでくるまで隠しておく
  if (isMine) landing.style.opacity = "0";
  await wait(delay);
  const f = deck.getBoundingClientRect();
  const t = landing.getBoundingClientRect();
  const card = document.createElement("div");
  card.className = "fx-cardback";
  Object.assign(card.style, {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  layer().appendChild(card);
  const dx = t.left - f.left;
  const dy = t.top - f.top;
  const s = Math.max(t.width / f.width, 0.5);
  await card
    .animate(
      [
        { transform: "none", opacity: 1 },
        {
          transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(${1 + (s - 1) * 0.5}) rotate(-12deg)`,
          offset: 0.45,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)`, opacity: isMine ? 1 : 0.3 },
      ],
      { duration: 560, easing: "cubic-bezier(.3,.7,.3,1)" },
    )
    .finished.catch(() => {});
  card.remove();
  if (isMine) {
    landing.style.opacity = "";
    landing.animate(
      [
        { transform: "rotateY(90deg) scale(1.1)", filter: "brightness(1.8)" },
        { transform: "none", filter: "brightness(1)" },
      ],
      { duration: 280, easing: "ease-out" },
    );
  }
}

/** マスターのライフが増減したときの数字（攻撃以外：炎上・祝福） */
export function popMaster(player: PlayerId, text: string, kind: "dmg" | "heal") {
  const el = q(`[data-master="${player}"]`);
  popNumber(el, text, kind);
  if (kind === "dmg") shake(el, 0.5);
}
