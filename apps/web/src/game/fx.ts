import type { AttackTarget, GameEvent, GameState, PlayerId, RuleCard } from "@trends/game-core";
import { viewUnit, withRushBoost } from "@trends/game-core";
import { gsap } from "gsap";
import { frameRect } from "../frame";
import { blackFlash } from "../fx/blackFlash";
import { buzzPower } from "../fx/buzzPower";
import { riseSoul, SOUL, soulFly, soulSize } from "../fx/deathSoul";
import { dissolve } from "../fx/dissolve";
import { healMist } from "../fx/healMist";
import { impact } from "../fx/impact";
import { thrust } from "../fx/thrust";

/**
 * 対戦画面の演出（DOM を直接アニメーションさせる）。
 * ルールの結果は game-core が決め、ここは「見せ方」だけを担当する。
 * 要素は data 属性で探す：data-uid（場のキャラクター）／data-master（プレイヤー）／data-pile（山札・トラッシュ）／data-hand（手札）
 */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canAnimate = () => typeof document !== "undefined" && typeof Element.prototype.animate === "function";
/** 待ち。GSAP の時間で数える（開発中に __gsap で演出をまとめて遅くしても、間合いがずれないように） */
const wait = (ms: number) => new Promise<void>((r) => gsap.delayedCall(ms / 1000, r));
const q = (sel: string) => document.querySelector<HTMLElement>(sel);

/** 画面座標で置く演出の層（#fx-layer） */
export function fxLayer(): HTMLElement {
  return layer();
}

function layer(): HTMLElement {
  let el = document.getElementById("fx-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-layer";
    // 演出の層は body の直下に、画面いっぱいに置く（広い画面では、枠の外を CSS で切る。frame.ts）
    document.body.appendChild(el);
  }
  return el;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * 画面のふちのキャラクターに出す札や数字が、画面の外に見切れないようにずらす。
 * 札は横の中心（translate(-50%)）で置くので、幅の半分＋余白より内側に収める。
 */
function keepInside(n: HTMLElement, x: number) {
  const half = n.offsetWidth / 2;
  const margin = 8;
  // 画面の枠（スマホの縦の画面）の中に収める
  const f = frameRect();
  const clamped = Math.min(Math.max(x, f.left + half + margin), f.right - half - margin);
  n.style.left = `${clamped}px`;
}

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
  keepInside(n, c.x);
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

/**
 * 守り（盾・無敵）でダメージを全部止めたとき：当たったところに六角の波紋が広がり、帯の金の膜が光って、
 * 盾の形を背にした金の「0」を大きく出す（ダメージの数字を出すとライフが減らないのに違和感があるため。10月25日）
 */
export function popShieldZero(target: HTMLElement | null) {
  if (!target || !canAnimate()) return;
  shieldRipple(target, 1);
  const r = target.getBoundingClientRect();
  const n = document.createElement("div");
  n.className = "fx-zero";
  n.textContent = "0";
  const x = r.left + r.width / 2;
  n.style.left = `${x}px`;
  n.style.top = `${r.top + r.height * 0.15}px`;
  layer().appendChild(n);
  keepInside(n, x);
  n.animate(
    [
      { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(0.92)", opacity: 1, offset: 0.16 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.24 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.76 },
      { transform: "translate(-50%, -70%) scale(1)", opacity: 0 },
    ],
    { duration: reduced() ? 900 : 1300, easing: "cubic-bezier(.2,.8,.3,1)" },
  ).onfinish = () => n.remove();
}

/** 守りに当たった：当たったところ（帯の上のふち）に六角の波紋。帯の金の膜も光らせる */
function shieldRipple(target: HTMLElement, power: number) {
  const film = target.querySelector<HTMLElement>(".pb-film");
  film?.animate([{ filter: `brightness(${1 + 1.6 * power})` }, { filter: "brightness(1)" }], {
    duration: 450,
    easing: "ease-out",
  });
  if (reduced()) return;
  const r = target.getBoundingClientRect();
  for (const delay of [0, 90]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "fx-hex");
    svg.setAttribute("viewBox", "-100 -100 200 200");
    const size = 180;
    Object.assign(svg.style, {
      left: `${r.left + r.width / 2 - size / 2}px`,
      top: `${r.top + 4 - size / 4}px`,
      width: `${size}px`,
      height: `${size / 2}px`,
    });
    svg.setAttribute("preserveAspectRatio", "none");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const pts = Array.from({ length: 6 }, (_, j) => {
      const a = (j / 6) * Math.PI * 2 + Math.PI / 6;
      return `${(Math.cos(a) * 90).toFixed(1)} ${(Math.sin(a) * 90).toFixed(1)}`;
    });
    path.setAttribute("d", `M${pts.join(" L")} Z`);
    path.setAttribute("stroke-width", "6");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
    layer().appendChild(svg);
    svg.animate(
      [
        { transform: "scale(0.1)", opacity: power },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: 480, delay, easing: "cubic-bezier(.1,.7,.3,1)", fill: "backwards" },
    ).onfinish = () => svg.remove();
  }
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

/** 画面全体を軽く揺らす（プレイヤーへの攻撃） */
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

/** 抜け殻を作った本体と、その抜け殻が消え終わるまでの Promise */
const trashing = new WeakMap<HTMLElement, Promise<void>>();

/**
 * 破壊されたキャラクターの抜け殻を作り、トラッシュへ飛ばす（本体は React がすぐ消すため）。消え終わったら resolve する。
 * 抜け殻を作った本体には印（data-trashed）を付け、二重に抜け殻を作らない（2回目は、1回目の消え終わりを返す）。
 * hide なら本体を隠す（いなくなると決まっているとき。消え終わるのを待つ間に、本体が見えないように）
 */
function toTrash(
  el: HTMLElement | null,
  owner: PlayerId,
  to: "trash" | "hand" = "trash",
  hide = false,
): Promise<void> {
  if (!el) return Promise.resolve();
  if (el.dataset.trashed) {
    if (hide) el.style.visibility = "hidden";
    return trashing.get(el) ?? Promise.resolve();
  }
  el.dataset.trashed = "1";
  const done = ghostToTrash(el, owner, to);
  trashing.set(el, done);
  if (hide) el.style.visibility = "hidden";
  return done;
}

function ghostToTrash(el: HTMLElement, owner: PlayerId, to: "trash" | "hand"): Promise<void> {
  const from = el.getBoundingClientRect();
  const pile = q(
    to === "hand" ? `[data-hand="${owner}"]` : `[data-pile="trash-${owner}"]`,
  )?.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  // 場に出たときの落ちてくる動き（.enter）を抜け殻でやり直さないように外す
  ghost.classList.remove("enter");
  ghost.style.animation = "none";
  ghost.classList.add("fx-ghost");
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  layer().appendChild(ghost);
  // 墓地へ行くキャラクターは、黒く染まって溶けるように消える
  if (to === "trash") return dissolve(ghost);
  const dx = pile ? center(pile).x - center(from).x : 0;
  const dy = pile ? center(pile).y - center(from).y : 40;
  const s = pile ? pile.width / from.width : 0.5;
  const move = ghost.animate(
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
  );
  return move.finished.then(
    () => ghost.remove(),
    () => ghost.remove(),
  );
}

/**
 * 攻撃の演出：溜め → 突進 → 衝撃（ダメージ表示・揺れ）→ 戻る。
 * 倒れる予定のキャラクターはトラッシュへ飛ばす。resolve したら state を更新してよい。
 */
export async function animateAttack(
  before: GameState,
  player: PlayerId,
  from: number,
  target: AttackTarget,
  catalog: Record<string, RuleCard>,
  /**
   * onImpact：当たった瞬間に呼ぶ（プレイヤーのライフの表示を、当たったのと同時に減らすため）。
   * leaderHit：プレイヤーへの攻撃で、守り（盾・無敵）に当たったとき、実際に通ったダメージ
   */
  opts: { onImpact?: () => void; leaderHit?: { dealt: number; blocked: boolean } } = {},
): Promise<void> {
  if (!canAnimate() || reduced()) {
    opts.onImpact?.();
    return;
  }
  const foeId: PlayerId = player === "p1" ? "p2" : "p1";
  // 突進で攻撃したときの強化は、先に見せてから殴る（強化と攻撃を同時に動かさない）
  const boost = withRushBoost(before, player, from, target, catalog);
  if (boost.state !== before) {
    const boosted = boost.state.players[player].field[from];
    if (boosted) {
      const el = q(`[data-uid="${boosted.uid}"]`);
      await showRushBoost(
        el,
        boost.events,
        player,
        from,
        viewUnit(boost.state, player, boosted, catalog).attack,
      );
    }
  }
  const game = boost.state;
  const atk = game.players[player].field[from];
  const atkCard = atk ? catalog[atk.cardId] : undefined;
  const atkEl = atk ? q(`[data-uid="${atk.uid}"]`) : null;
  const def = target.kind === "unit" ? game.players[foeId].field[target.slot] : null;
  const defCard = def ? catalog[def.cardId] : undefined;
  const defEl = def ? q(`[data-uid="${def.uid}"]`) : q(`[data-master="${foeId}"]`);
  if (!atk || !atkCard || !atkEl || !defEl) return;
  const av = viewUnit(game, player, atk, catalog);
  const dv = def ? viewUnit(game, foeId, def, catalog) : null;
  const dmg = av.attack;
  const counter = dv?.attack ?? 0;
  /**
   * 倒れたら墓地へ行く（闇堕ちは、あとでプレイヤーが選んだときだけ）。
   * 【破壊されたとき】を持つキャラクターは送らない（抜け殻になって残り、魂が抜け出てから墓地へ。fx/deathSoul.ts）
   */
  const goesToTrash = (v: { deathEffect: boolean }) => !v.deathEffect;

  const a = atkEl.getBoundingClientRect();
  const d = defEl.getBoundingClientRect();
  // 対戦画面は拡大・縮小しているので、画面上の距離を舞台の中の距離に直す
  const scale = atkEl.offsetWidth > 0 ? a.width / atkEl.offsetWidth : 1;
  const dx = ((center(d).x - center(a).x) * 0.78) / scale;
  const dy = ((center(d).y - center(a).y) * 0.78) / scale;
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
  // ぶつかった点：受けた側のカードの、攻撃してきた側のふち寄り
  const src = center(a);
  const dst = center(d);
  const len = Math.hypot(dst.x - src.x, dst.y - src.y) || 1;
  const reach = Math.min(d.width, d.height) * 0.32;
  const hit = { x: dst.x - ((dst.x - src.x) / len) * reach, y: dst.y - ((dst.y - src.y) / len) * reach };
  const power = def ? 1 + Math.min(0.5, dmg / 8) : 1.35 + Math.min(0.4, dmg / 10);
  void impact(hit, src, atkCard.attributes, a.width, power);
  // ヒットストップ：当たった瞬間に一瞬だけ止めて、重さを出す
  lunge.pause();
  opts.onImpact?.();
  const guard = !def ? opts.leaderHit : undefined;
  if (guard?.blocked && guard.dealt <= 0) popShieldZero(defEl);
  else if (guard?.blocked) {
    // 守りで減らした残りだけ通った：通った数を出し、守りも光らせる
    shieldRipple(defEl, 0.6);
    popNumber(defEl, `-${guard.dealt}`);
  } else popNumber(defEl, `-${dmg}`);
  if (def && defCard) {
    shake(defEl, 1);
    if (counter > 0) popNumber(atkEl, `-${counter}`);
  } else {
    shake(defEl, 0.6);
    quake(Math.min(2, 0.6 + dmg / 4));
  }
  await wait(def ? 70 : 90);
  lunge.play();
  await lunge.finished.catch(() => {});
  atkEl.style.zIndex = "";

  // 倒れるものはトラッシュへ
  if (def && dv && dmg >= dv.hp && goesToTrash(dv)) void toTrash(defEl, foeId);
  if (def && counter >= av.hp && goesToTrash(av)) void toTrash(atkEl, player);
  await wait(60);
}

/** バズの演出（絵の帯 → 赤い光の筋 → 「+2」）。数字を変える瞬間に resolve する。中身は fx/buzzPower.ts */
export function animateBuzz(uid: number, opts: { art?: string; attack: number; hp: number }): Promise<void> {
  return buzzPower(layer(), q(`[data-uid="${uid}"]`), opts);
}

/** バズで数字が変わった瞬間：攻撃力・体力の丸を軽く弾ませる（光らせない） */
export function markBuzzed(uid: number) {
  const el = q(`[data-uid="${uid}"]`);
  if (!el || !canAnimate() || reduced()) return;
  for (const s of el.querySelectorAll<HTMLElement>(".mini-atk, .mini-hp")) {
    s.animate([{ scale: 1.28 }, { scale: 1 }], { duration: 240, easing: "cubic-bezier(.3,1.5,.5,1)" });
  }
}

/**
 * 便乗：バズしたキャラクターから便乗のキャラクターへ光の玉が飛び、当たった瞬間に光って「便乗 +1/+1」を出し、
 * 攻撃力・体力の数字をそこで上げる。state はもう進んでいるので、当たるまでは数字を元の値で見せておく
 * （React が持つ文字のノードの値だけを変える。次に描き直されると正しい値に戻る）
 */
export function showRiding(
  fromUid: number,
  toUid: number,
  add: { attack: number; hp: number },
  delay: number,
) {
  const target = q(`[data-uid="${toUid}"]`);
  if (!target || !canAnimate() || reduced()) return;
  const atk = target.querySelector<HTMLElement>(".mini-atk");
  const hp = target.querySelector<HTMLElement>(".mini-hp");
  const shift = (el: HTMLElement | null, d: number) => {
    const t = el?.firstChild;
    if (t?.nodeType === Node.TEXT_NODE && d !== 0) t.nodeValue = String(Number(t.nodeValue) + d);
  };
  shift(atk, -add.attack);
  shift(hp, -add.hp);
  void (async () => {
    await wait(delay);
    const src = q(`[data-uid="${fromUid}"]`);
    if (src)
      await fly(center(src.getBoundingClientRect()), center(target.getBoundingClientRect()), "#ffd76a");
    glow(target, "#ffd76a");
    popLabel(target, `便乗 +${add.attack}/+${add.hp}`, "#ffd76a");
    shift(atk, add.attack);
    shift(hp, add.hp);
    for (const el of [atk, hp])
      el?.animate([{ transform: "scale(1.7)" }, { transform: "none" }], {
        duration: 360,
        easing: "ease-out",
      });
  })();
}

/** 強化の「+N/+N」 */
const buffText = (e: { attack: number; hp: number }) =>
  `${e.attack >= 0 ? "+" : ""}${e.attack}/${e.hp >= 0 ? "+" : ""}${e.hp}`;

/** 突進の強化：攻撃するキャラクターを光らせて「+1/+1」を出し、攻撃力の数字を先に上げる。見せ終わってから突進する */
async function showRushBoost(
  atk: HTMLElement | null,
  events: GameEvent[],
  player: PlayerId,
  from: number,
  attack: number,
) {
  if (!atk) return;
  const ups = events.filter(
    (e): e is Extract<GameEvent, { type: "buffed" }> =>
      e.type === "buffed" && e.player === player && e.slot === from,
  );
  const a = ups.reduce((n, e) => n + e.attack, 0);
  const h = ups.reduce((n, e) => n + e.hp, 0);
  if (a === 0 && h === 0) return;
  glow(atk, "#ffd76a");
  popLabel(atk, `突進 ${a >= 0 ? "+" : ""}${a}/${h >= 0 ? "+" : ""}${h}`, "#ffd76a");
  atk
    .animate(
      [
        { transform: "none", filter: "brightness(1)" },
        { transform: "translateY(-6px) scale(1.1)", filter: "brightness(1.5)", offset: 0.4 },
        { transform: "none", filter: "brightness(1)" },
      ],
      { duration: 520, easing: "ease-out" },
    )
    .finished.catch(() => {});
  // 攻撃力の数字は、ここで先に上げて見せる（盤面の state は攻撃のあとで進む。そのとき同じ値で描き直される）
  const num = atk.querySelector<HTMLElement>(".mini-atk");
  if (num && a !== 0) {
    num.textContent = String(attack);
    num.animate([{ transform: "scale(1.7)" }, { transform: "none" }], { duration: 360, easing: "ease-out" });
  }
  await wait(700);
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

/** プレイヤーのライフが増減したときの数字（攻撃以外：炎上・祝福） */
export function popMaster(player: PlayerId, text: string, kind: "dmg" | "heal") {
  const el = q(`[data-master="${player}"]`);
  popNumber(el, text, kind);
  if (kind === "dmg") shake(el, 0.5);
  else void healMist(el);
}

/** 闇堕ち：紫の閃光とともに裏返る（restore なら白く光って表に戻る） */
export function flipCard(uid: number, kind: "dark" | "restore") {
  const el = q(`[data-uid="${uid}"]`);
  if (!el || !canAnimate() || reduced()) return;
  const glow = kind === "dark" ? "#b06bff" : "#ffffff";
  el.animate(
    [
      { transform: "rotateY(0deg) scale(1)", filter: "brightness(1)" },
      {
        transform: "rotateY(90deg) scale(1.15)",
        filter: `brightness(2) drop-shadow(0 0 18px ${glow})`,
        offset: 0.45,
      },
      {
        transform: "rotateY(0deg) scale(1.05)",
        filter: `brightness(1.3) drop-shadow(0 0 24px ${glow})`,
        offset: 0.75,
      },
      { transform: "none", filter: "brightness(1)" },
    ],
    { duration: 900, easing: "cubic-bezier(.3,.7,.3,1)" },
  );
  const r = el.getBoundingClientRect();
  burst(center(r), glow);
}

/** 効果ダメージ（呪文など）の数字 */
export function popDamage(uid: number, amount: number) {
  const el = q(`[data-uid="${uid}"]`);
  popNumber(el, `-${amount}`);
  shake(el, 0.7);
}

/* ---------- 呪文・登場時の効果の演出 ---------- */

type Point = { x: number; y: number };

/** 光の玉が source から target へ飛ぶ（少し弧を描く） */
async function fly(from: Point, to: Point, color: string, size = 20): Promise<void> {
  const orb = document.createElement("div");
  orb.className = "fx-orb";
  orb.style.setProperty("--c", color);
  Object.assign(orb.style, {
    left: `${from.x}px`,
    top: `${from.y}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  layer().appendChild(orb);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = -Math.min(90, Math.hypot(dx, dy) * 0.25);
  await orb
    .animate(
      [
        { transform: "translate(-50%,-50%) scale(0.3)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1.2)", opacity: 1, offset: 0.12 },
        {
          transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 + lift}px)) scale(1)`,
          offset: 0.55,
        },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`, opacity: 1 },
      ],
      { duration: 420, easing: "cubic-bezier(.4,0,.6,1)" },
    )
    .finished.catch(() => {});
  orb.remove();
}

/** 文字の札（晒し・眠り・+1/+1 など）がポンと出て消える */
function popLabel(target: HTMLElement | null, text: string, color: string) {
  if (!target) return;
  const c = center(target.getBoundingClientRect());
  const n = document.createElement("div");
  n.className = "fx-label";
  n.textContent = text;
  n.style.setProperty("--c", color);
  n.style.left = `${c.x}px`;
  n.style.top = `${c.y}px`;
  layer().appendChild(n);
  keepInside(n, c.x);
  n.animate(
    [
      { transform: "translate(-50%, -20%) scale(0.5)", opacity: 0 },
      { transform: "translate(-50%, -60%) scale(1.25)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%, -70%) scale(1)", opacity: 1, offset: 0.7 },
      { transform: "translate(-50%, -110%) scale(0.95)", opacity: 0 },
    ],
    { duration: 1100, easing: "cubic-bezier(.2,.8,.3,1)" },
  ).onfinish = () => n.remove();
}

/** 光る（回復・強化のとき、そのキャラクターが内側から光る） */
function glow(el: HTMLElement | null, color: string) {
  if (!el) return;
  el.animate(
    [
      { filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}00` },
      { filter: "brightness(1.6)", boxShadow: `0 0 26px 6px ${color}`, offset: 0.35 },
      { filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}00` },
    ],
    { duration: 700, easing: "ease-out" },
  );
}

/**
 * 効果でキャラクターを出す前の合図：出どころから、出す枠へ光の玉が飛び、枠に光が集まる。
 * この Promise が終わってから、出たキャラクターを置く（出したカードと一緒に出すと、何の効果で出たか分からないため）
 */
export async function summonCue(
  from: HTMLElement | Point | null,
  slot: HTMLElement | null,
  color: string,
  /** 【破壊されたとき】に出す：魂（fx/deathSoul.ts）が尾を引いて枠へ飛ぶ */
  soul = false,
): Promise<void> {
  if (!slot || !canAnimate() || reduced()) return;
  const to = center(slot.getBoundingClientRect());
  const source = from instanceof HTMLElement ? center(from.getBoundingClientRect()) : from;
  if (source && soul) await soulFly(layer(), source, to, soulSize(slot));
  else if (source) await fly(source, to, color);
  // 枠に光が集まる（大きな輪が、枠の大きさまで縮んで光る）
  const ring = document.createElement("div");
  ring.className = "fx-burst";
  ring.style.left = `${to.x}px`;
  ring.style.top = `${to.y}px`;
  ring.style.setProperty("--c", color);
  layer().appendChild(ring);
  glow(slot, color);
  await ring
    .animate(
      [
        { transform: "translate(-50%,-50%) scale(2.2)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1.3)", opacity: 0.9, offset: 0.5 },
        { transform: "translate(-50%,-50%) scale(0.5)", opacity: 0 },
      ],
      { duration: 360, easing: "cubic-bezier(.5,0,.8,.6)" },
    )
    .finished.catch(() => {});
  ring.remove();
}

const STATUS_COLOR: Record<string, string> = {
  晒し: "#ff4f9a",
  眠り: "#8fb7ff",
  沈黙: "#f4f4f4",
  ガード消滅: "#f4f4f4",
};

/** 効果の出来事を、1つずつ「飛んで・当たる」演出にする。見せる出来事が無ければ false */
export function hasVisibleEffects(events: GameEvent[]) {
  return events.some((e) =>
    [
      "damaged",
      "leaderDamaged",
      "healed",
      "leaderHealed",
      "buffed",
      "status",
      "stolen",
      "bounced",
      "shield",
      "destroyed",
    ].includes(e.type),
  );
}

/**
 * 呪文・登場時・ターンの始めと終わりの効果を見せる。
 * shown は今画面に出ている state（効果を受ける前の姿）。next はすべて終わったあとの state。
 * from は効果の出どころ（呪文なら画面の真ん中、登場なら出たキャラクター）。null なら飛ばさずに当たるだけ。
 * skip のキャラクターは、別の演出で墓地へ送り終えているので送らない。
 */
export async function animateEffects(
  shown: GameState,
  events: GameEvent[],
  next: GameState,
  opts: {
    from: Point | HTMLElement | null;
    tint?: string;
    skip?: ReadonlySet<number>;
    /** いなくなるキャラクターが消え終わるまで待つ（このあとに、効果で出るキャラクターを置くとき） */
    untilGone?: boolean;
    /** このすぐあとに【破壊されたとき】の魂が抜け出る：消えるのを見せ切るまで待たない */
    soulNext?: boolean;
    /**
     * 【破壊されたとき】の効果：破壊されたキャラクター（el。抜け殻になってその枠に残っている）から魂が抜け出て、効果の先へ飛ぶ。
     * from は抜け殻が見つからないときの出どころ（いた枠）。当たったら、抜け殻を墓地へ送る。魂の出たあとの点を onRise に渡す
     */
    soul?: { el: HTMLElement | null; owner: PlayerId; onRise?: (at: Point | null) => void };
  },
): Promise<void> {
  if (!canAnimate() || reduced()) return;
  const fromPoint = opts.from instanceof HTMLElement ? center(opts.from.getBoundingClientRect()) : opts.from;
  const source = opts.soul ? await riseSoul(layer(), opts.soul.el, fromPoint) : fromPoint;
  opts.soul?.onRise?.(source);
  const unitEl = (p: PlayerId, slot: number) => {
    const u = shown.players[p].field[slot];
    return u ? q(`[data-uid="${u.uid}"]`) : null;
  };
  const masterEl = (p: PlayerId) => q(`[data-master="${p}"]`);

  const hits: { el: HTMLElement | null; color: string; land: (el: HTMLElement) => void }[] = [];
  events.forEach((e, idx) => {
    switch (e.type) {
      case "damaged":
        hits.push({
          el: unitEl(e.player, e.slot),
          color: opts.tint ?? "#ff6a3d",
          land: (el) => {
            burst(center(el.getBoundingClientRect()), opts.tint ?? "#ff5a4a");
            popNumber(el, `-${e.amount}`);
            shake(el, 0.8);
          },
        });
        break;
      case "leaderDamaged": {
        // 盾で減らした残りが通った（すぐ前に、同じプレイヤーの守りの出来事がある）
        const prev = events[idx - 1];
        const guarded = prev?.type === "shield" && prev.kind === "blocked" && prev.player === e.player;
        hits.push({
          el: masterEl(e.player),
          color: opts.tint ?? "#ff6a3d",
          land: (el) => {
            if (guarded) shieldRipple(el, 0.6);
            burst(center(el.getBoundingClientRect()), "#ff5a4a");
            popNumber(el, `-${e.amount}`);
            shake(el, 0.6);
            quake(Math.min(1.6, 0.4 + e.amount / 4));
          },
        });
        break;
      }
      case "healed":
        hits.push({
          el: unitEl(e.player, e.slot),
          color: "#6dffa8",
          land: (el) => {
            glow(el, "#6dffa8");
            void healMist(el);
            popNumber(el, `+${e.amount}`, "heal");
          },
        });
        break;
      case "leaderHealed":
        hits.push({
          el: masterEl(e.player),
          color: "#6dffa8",
          land: (el) => {
            glow(el, "#6dffa8");
            void healMist(el);
            popNumber(el, `+${e.amount}`, "heal");
          },
        });
        break;
      case "buffed": {
        const up = e.attack >= 0 && e.hp >= 0;
        const text = buffText(e);
        hits.push({
          el: unitEl(e.player, e.slot),
          color: up ? "#ffd76a" : "#b06bff",
          land: (el) => {
            glow(el, up ? "#ffd76a" : "#b06bff");
            popLabel(el, text, up ? "#ffd76a" : "#c08bff");
          },
        });
        break;
      }
      case "status": {
        const color = STATUS_COLOR[e.status] ?? "#ffffff";
        hits.push({
          el: unitEl(e.player, e.slot),
          color,
          land: (el) => {
            burst(center(el.getBoundingClientRect()), color);
            popLabel(el, e.status, color);
            shake(el, 0.4);
          },
        });
        break;
      }
      case "bounced":
        hits.push({
          el: unitEl(e.player, e.slot),
          color: "#b06bff",
          land: (el) => {
            glow(el, "#b06bff");
            popLabel(el, "手札へ", "#d9b0ff");
          },
        });
        break;
      case "shield": {
        if (e.kind === "blocked") {
          // 盾で減らして残りが通ったなら、通ったダメージ（続く leaderDamaged）の方で見せる
          const nextEv = events[idx + 1];
          if (nextEv?.type === "leaderDamaged" && nextEv.player === e.player) break;
          // 守りで全部止めた：金の 0
          hits.push({ el: masterEl(e.player), color: "#ffd76a", land: (el) => popShieldZero(el) });
          break;
        }
        // 守りが付いた（盾は受けるダメージを減らす数、無敵は「無敵」）
        const cut = e.amount > 0;
        hits.push({
          el: masterEl(e.player),
          color: cut ? "#ffd76a" : "#9fd8ff",
          land: (el) => {
            glow(el, cut ? "#ffd76a" : "#9fd8ff");
            popLabel(el, cut ? `ダメージ-${e.amount}` : "無敵", cut ? "#ffe39a" : "#cfeeff");
          },
        });
        break;
      }
      case "drew":
        // 【破壊されたとき】に引く：魂が山札へ飛ぶ（引いたカードが手札へ来るのは、このあとのいつもの見せ方）
        if (opts.soul && e.player === opts.soul.owner)
          hits.push({
            el: q(`[data-pile="deck-${e.player}"]`),
            color: SOUL.mid,
            land: (el) => glow(el, SOUL.glow),
          });
        break;
      case "stolen":
        hits.push({
          el: unitEl(e.player === "p1" ? "p2" : "p1", e.from),
          color: "#ff7ad9",
          land: (el) => {
            glow(el, "#ff7ad9");
            popLabel(el, "推し変", "#ff7ad9");
          },
        });
        break;
    }
  });

  // 1つずつ少しずらして飛ばす（全体攻撃はほぼ同時に）
  const gap = hits.length > 3 ? 90 : 170;
  const flights = hits.map(async (h, i) => {
    await wait(i * gap);
    if (!h.el) return;
    const to = center(h.el.getBoundingClientRect());
    if (source && opts.soul) await soulFly(layer(), source, to, soulSize(opts.soul.el));
    else if (source) await fly(source, to, h.color);
    h.land(h.el);
  });
  await Promise.all(flights);
  // 【破壊されたとき】の抜け殻は、当たったらすぐに墓地へ（ほかに倒れたキャラクターは、当たったところを見せてから）
  if (opts.soul?.el) {
    const shell = opts.soul.el;
    const owner = opts.soul.owner;
    void wait(hits.length > 0 ? 140 : 0).then(() => toTrash(shell, owner, "trash", true));
  }
  // 当たったところを少し見せてから
  if (hits.length > 0) await wait(520);
  const gone = retireUnits(shown, events, next, opts.skip);
  await (opts.untilGone ? gone : wait(hits.length > 0 && !opts.soulNext ? 460 : 0));
}

/**
 * 場からいなくなるキャラクター（次の state にいないもの）を、墓地へ（手札に戻ったものは手札へ）飛ばす。
 * skip のキャラクターは、別の演出で消し終えているので飛ばさない。すべて消え終わったら resolve する
 */
export function retireUnits(
  shown: GameState,
  events: GameEvent[],
  next: GameState,
  skip?: ReadonlySet<number>,
): Promise<void> {
  if (!canAnimate() || reduced()) return Promise.resolve();
  // 手札に戻ったキャラクターは手札へ
  const bounced = new Set(
    events.flatMap((e) => {
      const u = e.type === "bounced" ? shown.players[e.player].field[e.slot] : null;
      return u ? [u.uid] : [];
    }),
  );
  // 倒れたキャラクター（次の state にいないもの）は墓地へ
  const alive = new Set(
    (["p1", "p2"] as const).flatMap((p) => next.players[p].field.flatMap((u) => (u ? [u.uid] : []))),
  );
  const gone: Promise<void>[] = [];
  for (const p of ["p1", "p2"] as const) {
    for (const u of shown.players[p].field) {
      if (u && !alive.has(u.uid) && !skip?.has(u.uid))
        gone.push(toTrash(q(`[data-uid="${u.uid}"]`), p, bounced.has(u.uid) ? "hand" : "trash", true));
    }
  }
  return Promise.all(gone).then(() => {});
}

/**
 * 『調停者』の裁き：『調停者』から対象へ光線で突き、当たった瞬間に時が止まる（fx/thrust.ts）。
 * 当たってから 0.5 秒後に、対象をふだんの消え方で墓地へ送る。arbiterUid は出た『調停者』
 *
 * 光線で突くのは、出た直後の裁きのダメージ（played のすぐあとに続く damaged）だけ。
 * そのあとの出来事（裁かれたキャラクターの【破壊されたとき】のダメージなど）は、突きのあとにふだんの効果の見せ方（rest）で見せる。
 * 炎上中のアイドルの「相手のキャラクターすべてに1ダメージ」が『調停者』自身にも当たり、自分を真下へ突いていたため
 */
export async function animateJudge(
  shown: GameState,
  events: GameEvent[],
  next: GameState,
  arbiterUid?: number,
  rest: (shown: GameState, events: GameEvent[], skip: ReadonlySet<number>) => Promise<void> = (g, ev, skip) =>
    animateEffects(g, ev, next, { from: null, skip }),
): Promise<void> {
  if (!canAnimate() || reduced()) return;
  const board = q(".board");
  const start = events.findIndex((e) => e.type === "played") + 1;
  let end = start;
  while (events[end]?.type === "damaged") end++;
  const after = events.slice(end);
  const targets = events.slice(start, end).flatMap((e) => {
    if (e.type !== "damaged") return [];
    const u = shown.players[e.player].field[e.slot];
    const el = u && u.uid !== arbiterUid ? q(`[data-uid="${u.uid}"]`) : null;
    return u && el ? [{ el, uid: u.uid, owner: e.player, slot: e.slot }] : [];
  });
  // 【破壊されたとき】が働く対象は、ここでは送らない（抜け殻になって残り、魂が抜け出てから墓地へ）
  const shells = new Set(
    after.flatMap((e) => (e.type === "deathTriggered" ? [`${e.player}:${e.slot}`] : [])),
  );
  if (!board || targets.length === 0) {
    void retireUnits(shown, events, next);
    return;
  }
  const arbiter = arbiterUid !== undefined ? q(`[data-uid="${arbiterUid}"]`) : null;
  const all = new Set(targets.map((t) => t.uid));
  const alive = new Set(
    (["p1", "p2"] as const).flatMap((p) => next.players[p].field.flatMap((u) => (u ? [u.uid] : []))),
  );
  await thrust(board, arbiter, targets, (uid) => {
    // その対象を、いつもの消え方で墓地へ（残る対象はそのまま）
    const t = targets.find((x) => x.uid === uid);
    if (t && !alive.has(uid) && !shells.has(`${t.owner}:${t.slot}`)) {
      // 抜け殻が消えたあと、続きの効果を見せている間に元のカードが見えないように隠す
      void toTrash(t.el, t.owner, "trash", true);
    }
  });
  // 続きの効果（【破壊されたとき】のダメージなど）を見せて、対象以外にいなくなるキャラクターをまとめて送る
  await rest(shown, after, all);
  await wait(300);
}

/**
 * 『フィクサー』の差し出し：差し出されたキャラクターを、真上で溜めた黒い閃光で順に貫く（fx/blackFlash.ts）。
 * 先に自分（me）のキャラクター、次に相手。貫いたキャラクターは、いつもの消え方で墓地へ。演出を見せたら true
 */
export async function animateSacrifice(
  shown: GameState,
  events: GameEvent[],
  me: PlayerId,
): Promise<boolean> {
  if (!canAnimate() || reduced()) return false;
  const board = q(".board");
  const targets = events
    .flatMap((e) => {
      if (e.type !== "sacrificed") return [];
      const u = shown.players[e.player].field[e.slot];
      const el = u ? q(`[data-uid="${u.uid}"]`) : null;
      return u && el ? [{ el, uid: u.uid, owner: e.player }] : [];
    })
    .sort((a, b) => Number(b.owner === me) - Number(a.owner === me));
  if (!board || targets.length === 0) return false;
  await blackFlash(board, targets, (uid) => {
    const t = targets.find((x) => x.uid === uid);
    if (t) void toTrash(t.el, t.owner);
  });
  return true;
}
