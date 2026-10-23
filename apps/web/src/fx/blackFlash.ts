import { gsap } from "gsap";

/**
 * 『フィクサー』の差し出し：黒い閃光（見た目だけ。ルールは game-core）。オーナーと詰めたモック
 * 「『フィクサー』黒い閃光の案」（Artifact）の決定案と同じ動きと秒数。
 *
 * 差し出すアイコン 1 体ごとに：
 * 1. 溜め 0.3 秒：アイコンの真上に、白い光をまとった黒い玉が生まれる。白い粒が吸い込まれ、下へ細い狙いの光がちらつく
 * 2. 引き 0.35 秒：玉が 28px 上へ引かれ、震えがだんだん強くなる
 * 3. 叩き込む 0.05 秒：太い黒い閃光が真下へ。先はカードの下辺でちょうど止まる
 * 4. 白黒が入れ替わって 0.3 秒止まる：場は白い紙、閃光とアイコンは黒い影（盤面の .fx-fixer-flip。GSAP の時計も止める）。
 *    閃光には白い輪郭を付け、黒い影のカードに刺さっているところが見えるようにする
 * 5. 動き出す：カードが白く飛んで震え、白い筋と粒が上と横へ跳ね、盤面が強く揺れ、まわりのアイコンも揺れる。
 *    閃光は 0.15 秒そのままで、0.25 秒で細くなって消える
 * 6. 貫いてから 0.3 秒後（止まっていた時間を除く）：onDeath で、ふだんオワコンになるときと同じ消え方を始める
 * 2 体（自分と相手）なら、0.9 秒（止まった分を足して）ずらして順に貫く。
 *
 * 描くのは盤面（board）の中に置いたキャンバス。アイコンの動きは CSS の個別のプロパティ（translate・scale・rotate）で付け、
 * ほかの演出の transform とぶつからないようにする（『調停者』の突き fx/thrust.ts と同じ決まり）。
 */

const CHARGE_AT = 80; // 決まってから玉が生まれるまで
const CHARGE = 300; // 玉が育つ
const PULL_AT = 380; // 引き始め
const PULL = 350; // 引きの溜め
const FIRE = 50; // 叩き込んで届くまで
const HIT = PULL_AT + PULL + FIRE;
const FREEZE = 300; // 白黒が入れ替わって止まる
const GAP = 900; // 次の対象までの間（止まっていた時間を除く）
const AFTER = 300; // 貫いてから消え始めるまで
const HOLD = 150; // 閃光がそのまま残る
const FADE = 250; // 閃光が細くなって消える
const SPARK = 520; // 白い筋と粒
const RISE = 0.4; // 玉の高さ（カードの上辺から、カードの高さに対して）
const PULL_PX = 28;
const WIDTH = 0.18; // 閃光の太さ（カードの幅に対して）

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, s: number, d: number) => clamp((t - s) / d);
const eo = (t: number, p = 2) => 1 - (1 - clamp(t)) ** p;
const ei = (t: number, p = 2) => clamp(t) ** p;

type Ctx = CanvasRenderingContext2D;

export interface FlashTarget {
  el: HTMLElement;
  uid: number;
}

const startAt = (i: number) => i * GAP;
const hitAt = (i: number) => startAt(i) + HIT;

/** 実際の時刻 → 演出の時刻。止まっている間は、演出の時刻が進まない */
function warp(real: number, n: number) {
  let shift = 0;
  for (let i = 0; i < n; i++) {
    const f = hitAt(i) + shift;
    if (real < f) break;
    if (real < f + FREEZE) return { te: hitAt(i), frozen: true };
    shift += FREEZE;
  }
  return { te: real - shift, frozen: false };
}

/** 決まった乱数（対象ごとに同じ形にする） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 閃光の形：上（y0）は丸く、少し下で一番太く、下（y1）へ向かって細く尖る */
function beamPath(x: number, y0: number, y1: number, w: number) {
  const len = y1 - y0;
  const wide = y0 + Math.min(len * 0.22, w * 6);
  const p = new Path2D();
  p.moveTo(x, y1);
  p.quadraticCurveTo(x - w * 0.5, y1 - len * 0.35, x - w / 2, wide);
  p.quadraticCurveTo(x - w / 2, y0, x, y0 - w * 0.4);
  p.quadraticCurveTo(x + w / 2, y0, x + w / 2, wide);
  p.quadraticCurveTo(x + w * 0.5, y1 - len * 0.35, x, y1);
  p.closePath();
  return p;
}

/** 黒い閃光：白い光のにじみ → 白いふち → 黒い芯の 3 層。止まっている間（ink）は黒一色の影に白い輪郭 */
function beam(
  ctx: Ctx,
  x: number,
  y0: number,
  y1: number,
  w: number,
  glow: number,
  ink: boolean,
  now: number,
) {
  if (y1 - y0 < 1 || w <= 0.2) return;
  ctx.save();
  if (ink) {
    // 黒一色に白い輪郭。黒い影になったカードに重なるところでも、刺さっているのが見える
    const p = beamPath(x, y0, y1, w * 1.5);
    ctx.fillStyle = "#000";
    ctx.fill(p);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 6;
    ctx.stroke(p);
    ctx.restore();
    return;
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 22 * glow;
  ctx.fillStyle = `rgba(255,255,255,${0.28 * glow})`;
  ctx.fill(beamPath(x, y0, y1, w * 3));
  ctx.shadowBlur = 10 * glow;
  ctx.fillStyle = `rgba(255,255,255,${0.9 * Math.min(1, glow)})`;
  ctx.fill(beamPath(x, y0, y1, w * 1.55));
  // 黒い芯（先の少し手前まで。先は白く光る）
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#000";
  ctx.fill(beamPath(x, y0 + w * 0.2, y1 - w * 1.4, w * 0.95));
  // 芯の上を走る細い白い筋
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 0.7;
  for (let k = 0; k < 2; k++) {
    const ph = (now / 90 + k * 0.5) % 1;
    const ya = lerp(y0, y1, ph * 0.8);
    const yb = ya + (y1 - y0) * 0.18;
    const g = ctx.createLinearGradient(0, ya, 0, yb);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${0.55 * glow})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = g;
    const dx = (k ? 1 : -1) * w * 0.18;
    ctx.beginPath();
    ctx.moveTo(x + dx, ya);
    ctx.lineTo(x + dx, yb);
    ctx.stroke();
  }
  ctx.restore();
}

/** 溜め：黒い玉に白い光のふち。まわりから白い粒が吸い込まれ、下へ細い狙いの光がちらつく */
function charge(
  ctx: Ctx,
  x: number,
  y: number,
  k: number,
  w: number,
  rnd: number[],
  now: number,
  down: number,
) {
  if (k <= 0) return;
  const R = w * (0.35 + 0.75 * eo(k));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 16 * k;
  ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`;
  ctx.beginPath();
  ctx.arc(x, y, R * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, y, 0, down);
  g.addColorStop(0, `rgba(255,255,255,${0.35 * k * (0.6 + 0.4 * Math.sin(now / 23))})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, down);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 16; i++) {
    const ph = (k * 1.7 + (rnd[i] ?? 0)) % 1;
    const th = (rnd[i + 16] ?? 0) * Math.PI * 2;
    const d = w * 4.2 * (1 - eo(ph));
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    ctx.beginPath();
    ctx.arc(x + Math.cos(th) * d, y + Math.sin(th) * d * 0.8, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 貫いた所から外へ跳ねる白い筋と粒（閃光が下へ抜けるので、反動で上と横へ多く跳ねる） */
function splinters(ctx: Ctx, x: number, y: number, a: number, rnd: number[]) {
  if (a < 0 || a > SPARK) return;
  const n = 22;
  const scale = 1.25;
  const g = eo(a / (SPARK * 0.45), 3);
  const f = 1 - seg(a, SPARK * 0.4, SPARK * 0.6);
  const r = (i: number) => rnd[i] ?? 0;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const th = -Math.PI / 2 + (r(i) - 0.5) * Math.PI * 1.7;
    const L = (16 + 46 * r(i + n)) * scale;
    const r0 = 5 * scale + L * 0.35 * g;
    const r1 = r0 + L * g * 0.65;
    const x0 = x + Math.cos(th) * r0;
    const y0 = y + Math.sin(th) * r0;
    const x1 = x + Math.cos(th) * r1;
    const y1 = y + Math.sin(th) * r1;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(255,255,255,${f})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = (1.4 + 2 * r(i + 2 * n)) * (1 - a / SPARK) * scale + 0.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 12; i++) {
    const th = -Math.PI / 2 + (r(i + 70) - 0.5) * Math.PI * 1.9;
    const d = (20 + 60 * r(i + 82)) * scale * eo(a / SPARK);
    ctx.globalAlpha = f * 0.9;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(th) * d,
      y + Math.sin(th) * d + 30 * (a / SPARK) ** 2 * scale,
      1 + r(i + 94) * 1.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** 盤面のゆれ：強く、すぐ減る */
const shakeAt = (t: number) => (t < 0 || t > 450 ? 0 : 14 * (1 - t / 450) ** 2 * Math.sin(t / 16));

/**
 * 黒い閃光を見せる。board は盤面、targets は差し出されたアイコン（順に貫く）。
 * onDeath(uid) は、その対象が消え始める時刻に呼ぶ（ふだんの消え方は呼ぶ側が出す）。全部終わったら resolve
 */
export function blackFlash(
  board: HTMLElement,
  targets: FlashTarget[],
  onDeath: (uid: number) => void,
): Promise<void> {
  const n = targets.length;
  if (n === 0) return Promise.resolve();
  const cv = document.createElement("canvas");
  cv.className = "fx-blackflash";
  board.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    cv.remove();
    for (const t of targets) onDeath(t.uid);
    return Promise.resolve();
  }
  const others = [...board.querySelectorAll<HTMLElement>(".unit[data-uid]")].filter(
    (el) => !targets.some((t) => t.el === el),
  );
  const rnds = targets.map((t) => {
    const r = rng(31 + t.uid * 17);
    return Array.from({ length: 120 }, r);
  });
  const dead = new Set<number>();
  const endReal = hitAt(n - 1) + SPARK + 100 + n * FREEZE;
  let paused = false;

  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    /** 後片付け（途中で失敗しても必ず呼ぶ。GSAP の時計を止めたままにしない） */
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const o of others) o.style.translate = "";
      board.style.translate = "";
      board.classList.remove("fx-fixer-flip");
      if (paused || gsap.globalTimeline.paused()) gsap.globalTimeline.resume();
      for (const tg of targets) {
        tg.el.style.scale = "";
        tg.el.style.rotate = "";
        tg.el.style.filter = "";
        if (!dead.has(tg.uid)) {
          dead.add(tg.uid);
          onDeath(tg.uid);
        }
      }
      cv.remove();
      resolve();
    };
    const step = (now: number) => {
      try {
        if (frame(now)) requestAnimationFrame(step);
        else finish();
      } catch (e) {
        console.warn("[fx] 『フィクサー』の黒い閃光の演出が途中で失敗しました", e);
        finish();
      }
    };
    /** 1 コマ描く。続けるなら true */
    const frame = (now: number): boolean => {
      const real = now - t0;
      const { te: t, frozen } = warp(real, n);
      // 止まっている間は、GSAP の時計（ほかの演出）も止める
      if (frozen !== paused) {
        paused = frozen;
        if (frozen) gsap.globalTimeline.pause();
        else gsap.globalTimeline.resume();
      }
      board.classList.toggle("fx-fixer-flip", frozen);

      // 盤面の中の座標（舞台は拡大縮小されているので、縮める前の大きさに直す）
      const br = board.getBoundingClientRect();
      const W = board.offsetWidth;
      const H = board.offsetHeight;
      const scale = br.width / W || 1;
      const dpr = (window.devicePixelRatio || 1) * scale;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const at = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        // 動かしている分（translate）を除いた、もとの位置
        const [dx, dy] = (el.style.translate || "0px 0px").split(" ").map((v) => Number.parseFloat(v) || 0);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const x = (r.left + r.width / 2 - br.left) / scale - (dx ?? 0);
        const y = (r.top + r.height / 2 - br.top) / scale - (dy ?? 0);
        return { x, y, w, h, top: y - h / 2, bottom: y + h / 2 };
      };

      let shake = 0;
      const push = new Map<HTMLElement, { x: number; y: number }>();
      targets.forEach((tg, i) => {
        const el = tg.el;
        const a = t - startAt(i);
        if (a < 0) return;
        const p = at(el);
        const rnd = rnds[i] ?? [];
        const w = p.w * WIDTH;
        const fireAt = PULL_AT + PULL;
        // 玉の位置（上へ引かれる）と震え
        const oy = Math.max(10, p.top - p.h * RISE) - PULL_PX * eo(seg(a, PULL_AT, PULL));
        const tremble = a >= PULL_AT && a < fireAt ? 1.8 * seg(a, PULL_AT, PULL) * Math.sin(now / 11) : 0;
        const after = a - HIT;
        if (a >= CHARGE_AT && a < HIT)
          charge(
            ctx,
            p.x + tremble,
            oy,
            a < fireAt ? seg(a, CHARGE_AT, CHARGE) : 1 - seg(a, fireAt, FIRE) * 0.6,
            w,
            rnd,
            now,
            p.bottom,
          );
        // 閃光：玉から真下へ。先はカードの下辺で止める
        if (a >= fireAt) {
          const tip = lerp(oy, p.bottom, ei(seg(a, fireAt, FIRE)));
          let bw = w;
          let glow = 1;
          if (after >= 0 && !frozen) {
            bw = w * (1 + 0.25 * (1 - seg(after, 0, 100))) * (1 - eo(seg(after, HOLD, FADE)));
            glow = 1.3 - 0.3 * seg(after, 0, 150);
          }
          beam(ctx, p.x, oy, tip, bw, glow, frozen, now);
        }
        if (after < 0 || frozen) return;
        splinters(ctx, p.x, p.y, after, rnd);
        shake += shakeAt(after);
        // まわりのアイコンも揺れる（遠いほど遅れて弱く届く）
        for (const o of others) {
          const q = at(o);
          const vx = q.x - p.x;
          const vy = q.y - p.y;
          const dist = Math.hypot(vx, vy) || 1;
          const t2 = after - dist * 0.9;
          if (t2 <= 0 || t2 >= 420) continue;
          const m = 7 * (1 - t2 / 420) ** 2 * Math.sin(t2 / 22) * Math.max(0.3, 1 - dist / 400);
          const cur = push.get(o) ?? { x: 0, y: 0 };
          cur.x += (vx / dist) * m;
          cur.y += (vy / dist) * m;
          push.set(o, cur);
        }
        // 対象：白く飛んで、ふくらんで震える。0.3 秒後に、ふだんの消え方へ
        if (dead.has(tg.uid)) return;
        if (after < AFTER) {
          el.style.scale = String(1 + 0.08 * Math.sin(Math.PI * seg(after, 0, 180)));
          el.style.rotate = `${(Math.sin(after / 12) * 3 * (1 - seg(after, 0, 380))).toFixed(2)}deg`;
          el.style.filter = after < 90 ? "brightness(3) grayscale(1)" : "";
        } else {
          dead.add(tg.uid);
          el.style.scale = "";
          el.style.rotate = "";
          el.style.filter = "";
          onDeath(tg.uid);
        }
      });

      for (const o of others) {
        const q = push.get(o);
        o.style.translate = q ? `${q.x.toFixed(2)}px ${q.y.toFixed(2)}px` : "";
      }
      board.style.translate = shake ? `${shake.toFixed(2)}px ${(shake * -0.5).toFixed(2)}px` : "";
      return real < endReal;
    };
    requestAnimationFrame(step);
  });
}
