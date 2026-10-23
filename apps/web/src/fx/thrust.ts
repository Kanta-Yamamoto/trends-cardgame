import { gsap } from "gsap";

/**
 * 『調停者』の突き（見た目だけ。ルールは game-core）。オーナーと詰めたモック「『調停者』の突き」（Artifact）と同じ動きと秒数。
 *
 * 対象 1 体ごとに：
 * 1. 引きの溜め 0.2 秒：『調停者』が対象と逆へ少し下がり、前に光が集まる
 * 2. 発射 0.07 秒：光線が対象を突き抜けて、盤面のふちまで一直線に伸びる
 * 3. 時が止まる 0.3 秒（当たって 0.04 秒後から）：盤面の色が反転し、すべてが止まる。
 *    途切れた弧の波紋（5 重）だけは止まらず、回りながらゆっくり広がる（処理が固まったように見せないため）
 * 4. 動き出す：光の筋と粒が飛び散り、波紋は加速して広がり切る。盤面が大きく揺れ、まわりのアイコンが波に押されて揺れる。
 *    対象はその場で一瞬ふくらんで震える（位置は動かさない。衝撃がカードの真ん中から出るように）
 * 5. 当たってから 0.5 秒後（止まっていた時間を除く）：onDeath で、ふだんオワコンになるときと同じ消え方を始める
 * 対象が 2 体以上なら、0.72 秒（止まった分を足して）ずつずらして順に突く。対象は敵味方を区別しない。
 *
 * 描くのは盤面（board）の中に置いたキャンバス。盤面ごと色を反転するので、光線や波紋も一緒に反転する。
 * アイコンの動きは CSS の個別のプロパティ（translate・scale・rotate）で付け、ほかの演出の transform とぶつからないようにする。
 * 時が止まっている間は GSAP の時計も止める（着地の弾みなど、ほかの演出も止まって見える）。
 */

const WAIT = 100; // 着地から溜めまで
const PULL = 200; // 引きの溜め
const FIRE = 70; // 発射して届くまで
const STOP = 80; // 白く飛んで止まる
const GAP = 720; // 次の対象までの間
const FREEZE = 300; // 時が止まる
const FREEZE_AT = 40; // 当たってから止まるまで
const AFTER = 500; // 当たってから消え始めるまで（止まっていた時間を除く）
const RING_MS = 950; // 波紋が広がり切るまで（実際の時間）
const SPIN = 2.2; // 波紋の回る速さ（ラジアン／秒）
const ARCS = 5;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eo = (t: number, p = 3) => 1 - (1 - clamp(t)) ** p;
const ei = (t: number, p = 3) => clamp(t) ** p;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type P = { x: number; y: number; w: number; h: number };
type Ctx = CanvasRenderingContext2D;

export interface ThrustTarget {
  el: HTMLElement;
  uid: number;
}

const thrustStart = (i: number) => WAIT + i * GAP;
const hitAt = (i: number) => thrustStart(i) + PULL + FIRE;

/** 実際の時刻 → 演出の時刻。止まっている間は、演出の時刻が進まない */
function warp(real: number, n: number) {
  let shift = 0;
  for (let i = 0; i < n; i++) {
    const f = hitAt(i) + FREEZE_AT + shift;
    if (real < f) break;
    if (real < f + FREEZE) return { te: hitAt(i) + FREEZE_AT, frozen: true };
    shift += FREEZE;
  }
  return { te: real - shift, frozen: false };
}

/** 溜めの光：小さな十字の星と光の玉 */
function charge(ctx: Ctx, x: number, y: number, k: number) {
  if (k <= 0 || k > 1) return;
  const a = clamp(k * 1.4);
  const r = lerp(4, 18, eo(k, 2));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.rotate(k * 1.6);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(0, 0, r * 1.8, 0);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(150,180,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -1.8);
    ctx.lineTo(r * 1.8, 0);
    ctx.lineTo(0, 1.8);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, "rgba(110,140,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** 光線：両端は細く、まん中は太い一直線 */
function beam(ctx: Ctx, fx: number, fy: number, tx: number, ty: number, w: number, glow: number) {
  const L = Math.hypot(tx - fx, ty - fy);
  if (L < 1 || w <= 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(fx, fy);
  ctx.rotate(Math.atan2(ty - fy, tx - fx));
  const shape = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -w * s * 0.35);
    ctx.lineTo(L * 0.5, (-w * s) / 2);
    ctx.lineTo(L, 0);
    ctx.lineTo(L * 0.5, (w * s) / 2);
    ctx.lineTo(0, w * s * 0.35);
    ctx.closePath();
  };
  ctx.shadowColor = "#4d74ff";
  ctx.shadowBlur = 20 * glow;
  ctx.fillStyle = "rgba(70,110,255,0.45)";
  shape(3.4);
  ctx.fill();
  ctx.shadowBlur = 8 * glow;
  ctx.fillStyle = "rgba(170,195,255,0.85)";
  shape(1.8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  shape(1);
  ctx.fill();
  ctx.restore();
}

/** 衝撃：ふくらむ圧の玉・飛び散る光の筋と粒（突いた向きに多め）。時が止まっている間は止まる */
function shock(ctx: Ctx, p: P, ang: number, k: number) {
  if (k < 0 || k > 1) return;
  const size = p.w;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const core = clamp(k / 0.35);
  if (core < 1) {
    const r = lerp(size * 0.3, size * 1.1, eo(core, 2));
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(255,255,255,${1 - core})`);
    g.addColorStop(0.35, `rgba(200,215,255,${0.7 * (1 - core)})`);
    g.addColorStop(1, "rgba(60,90,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 7);
    ctx.fill();
  }
  const q = clamp(k / 0.55);
  if (q < 1) {
    ctx.lineCap = "round";
    for (let i = 0; i < 18; i++) {
      const a = ang + (i / 18) * Math.PI * 2 + Math.sin(i * 7.3) * 0.12;
      const fwd = Math.max(0, Math.cos(a - ang));
      const len = size * (0.6 + fwd * 1.6 + ((i * 37) % 10) / 20);
      const r0 = lerp(size * 0.25, len * 0.9, eo(q, 2));
      const r1 = lerp(size * 0.35, len * 1.25, eo(q, 2.4));
      ctx.strokeStyle = `rgba(235,240,255,${(1 - q) * (0.55 + fwd * 0.45)})`;
      ctx.lineWidth = lerp(2.4, 0.5, q) * (0.7 + fwd * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
      ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 22; i++) {
    const s = ((i * 61) % 100) / 100;
    const r = ((i * 29) % 100) / 100;
    const a = ang + (s - 0.5) * 1.6;
    const d = eo(k, 2) * size * (1 + r * 2.2);
    ctx.fillStyle = `rgba(210,225,255,${(1 - k) * 0.95})`;
    ctx.beginPath();
    ctx.arc(
      p.x + Math.cos(a) * d,
      p.y + Math.sin(a) * d + ei(k, 2) * size * 0.3,
      lerp(2.4, 0.4, k) * (0.6 + r),
      0,
      7,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 波紋：円を 3 つに切った弧を 5 重。1 本ずつ少し遅れて出る。止まっている間はゆっくり、動き出すと加速して広がり（ease-in）、
 * カードの幅の約 1.4 倍で止まって薄れる。広がる間ずっと同じ速さで同じ向きに回る。e は当たってからの実際の時間
 */
function rings(ctx: Ctx, p: P, e: number) {
  if (e < 0) return;
  const size = p.w;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let j = 0; j < ARCS; j++) {
    const ej = e - j * 50;
    if (ej <= 0 || ej >= RING_MS) continue;
    const q = ej / RING_MS;
    const f = q ** 2.4;
    const r = lerp(size * (0.2 + j * 0.04), size * 1.4 * (1 - j * 0.09), f);
    const a = (1 - sstep(0.55, 1, q)) * (0.95 - j * 0.08);
    ctx.strokeStyle = `rgba(235,241,255,${a})`;
    ctx.lineWidth = lerp(1.9 - j * 0.15, 0.4, f);
    ctx.shadowColor = "#7d9bff";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    const off = j * 0.7 + (e / 1000) * SPIN;
    for (let k = 0; k < 3; k++) {
      const a0 = off + (k * Math.PI * 2) / 3;
      ctx.moveTo(p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r);
      ctx.arc(p.x, p.y, r, a0, a0 + 1.45);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 盤面のゆれ：強く、すぐ減る */
const shakeAt = (dt: number) => (dt >= 0 && dt < 480 ? (1 - dt / 480) ** 2 * 11 : 0);

/**
 * 突きを見せる。board は盤面、arbiter は『調停者』のアイコン、targets は裁かれるアイコン（順に突く）。
 * onDeath(uid) は、その対象が消え始める時刻に呼ぶ（ふだんの消え方は呼ぶ側が出す）。全部終わったら resolve
 */
export function thrust(
  board: HTMLElement,
  arbiter: HTMLElement | null,
  targets: ThrustTarget[],
  onDeath: (uid: number) => void,
): Promise<void> {
  const n = targets.length;
  if (n === 0) return Promise.resolve();
  const cv = document.createElement("canvas");
  cv.className = "fx-thrust";
  board.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    cv.remove();
    for (const t of targets) onDeath(t.uid);
    return Promise.resolve();
  }
  const others = [...board.querySelectorAll<HTMLElement>(".unit[data-uid]")].filter(
    (el) => el !== arbiter && !targets.some((t) => t.el === el),
  );
  const dead = new Set<number>();
  const last = hitAt(n - 1) + AFTER;
  const endReal = last + n * FREEZE + 400;
  let paused = false;

  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    /** 後片付け（途中で失敗しても必ず呼ぶ。GSAP の時計を止めたままにしない） */
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const o of others) {
        o.style.translate = "";
        o.style.rotate = "";
      }
      if (arbiter) arbiter.style.translate = "";
      board.style.translate = "";
      board.style.filter = "";
      if (paused || gsap.globalTimeline.paused()) gsap.globalTimeline.resume();
      for (const tg of targets) {
        tg.el.style.scale = "";
        tg.el.style.rotate = "";
        tg.el.style.filter = "";
        tg.el.classList.remove("fx-judged");
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
        console.warn("[fx] 『調停者』の突きの演出が途中で失敗しました", e);
        finish();
      }
    };
    /** 1 コマ描く。続けるなら true */
    const frame = (now: number): boolean => {
      const real = now - t0;
      const { te: t, frozen } = warp(real, n);
      // 時が止まっている間は、GSAP の時計（ほかの演出）も止める
      if (frozen !== paused) {
        paused = frozen;
        if (frozen) gsap.globalTimeline.pause();
        else gsap.globalTimeline.resume();
      }

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
      const at = (el: HTMLElement): P => {
        const r = el.getBoundingClientRect();
        // 動かしている分（translate）を除いた、もとの位置
        const [dx, dy] = (el.style.translate || "0px 0px").split(" ").map((v) => Number.parseFloat(v) || 0);
        return {
          x: (r.left + r.width / 2 - br.left) / scale - (dx ?? 0),
          y: (r.top + r.height / 2 - br.top) / scale - (dy ?? 0),
          w: el.offsetWidth,
          h: el.offsetHeight,
        };
      };
      const arb = arbiter ? at(arbiter) : { x: W / 2, y: H * 0.7, w: 60, h: 84 };

      let ax = 0;
      let ay = 0;
      let shake = 0;
      const push = new Map<HTMLElement, { x: number; y: number; r: number }>();
      targets.forEach((tg, i) => {
        const el = tg.el;
        const T = t - thrustStart(i);
        const hit = t - hitAt(i);
        const p = at(el);
        const sx = arb.x;
        const sy = arb.y - arb.h * 0.08;
        const D = Math.hypot(p.x - sx, p.y - sy) || 1;
        const ux = (p.x - sx) / D;
        const uy = (p.y - sy) / D;
        const ang = Math.atan2(uy, ux);

        // 1. 引きの溜め → 発射の反動で少し前へ → 戻る
        if (T >= 0 && T < PULL) {
          const k = eo(T / PULL, 2);
          ax -= ux * 8 * k;
          ay -= uy * 8 * k;
          charge(ctx, sx + ux * arb.w * 0.55 - ux * 8 * k, sy + uy * arb.w * 0.55 - uy * 8 * k, T / PULL);
        } else if (T >= PULL && T < PULL + 280) {
          const k = (T - PULL) / 280;
          const off = k < 0.25 ? lerp(-8, 5, eo(k / 0.25, 3)) : lerp(5, 0, eo((k - 0.25) / 0.75, 2));
          ax += ux * off;
          ay += uy * off;
        }

        // 2. 光線：突き抜けて盤面のふちまで。止まったあと、両側からしぼむ
        if (T >= PULL) {
          const reach = ei(clamp((T - PULL) / FIRE), 2);
          const far = Math.max(W, H) * 1.6;
          const fx = sx + ux * arb.w * 0.5;
          const fy = sy + uy * arb.w * 0.5;
          const after = clamp((hit - STOP) / 300);
          const w = hit >= 0 && hit < STOP ? 6.3 : lerp(4.2, 0, eo(after, 2));
          if (after < 1)
            beam(
              ctx,
              fx,
              fy,
              fx + ux * far * reach,
              fy + uy * far * reach,
              w,
              hit >= 0 && hit < STOP ? 2.2 : 1.2,
            );
        }

        // 3. 衝撃（カードの真ん中から）と波紋（波紋だけは実際の時間で動く）
        shock(ctx, p, ang, hit / 620);
        rings(ctx, p, real - hitAt(i) - i * FREEZE);
        shake += shakeAt(hit - STOP * 0.5);

        // まわりのアイコンが衝撃波に押される（近いほど強く、少し遅れて届く）
        for (const o of others) {
          const q = at(o);
          const vx = q.x - p.x;
          const vy = q.y - p.y;
          const dist = Math.hypot(vx, vy) || 1;
          const arrive = hit - dist * 0.9;
          if (arrive < 0 || arrive > 420) continue;
          const amp = (1 - arrive / 420) * Math.max(0, 1 - dist / (p.w * 4.2)) * 9;
          const wob = Math.sin((arrive / 420) * Math.PI * 3) * amp;
          const cur = push.get(o) ?? { x: 0, y: 0, r: 0 };
          cur.x += (vx / dist) * wob;
          cur.y += (vy / dist) * wob;
          cur.r += (vx > 0 ? 1 : -1) * wob * 0.35;
          push.set(o, cur);
        }

        // 対象：狙われている間は白い枠。当たると白く飛んで止まり、その場で一瞬ふくらんで震える
        if (!dead.has(tg.uid)) {
          el.classList.toggle("fx-judged", T >= 0 && hit < 0);
          if (hit >= 0) {
            const pulse = hit < STOP ? (hit / STOP) * 0.08 : lerp(0.08, 0, eo((hit - STOP) / 380, 3));
            const wob = hit > STOP ? Math.sin((hit - STOP) / 30) * (1 - clamp((hit - STOP) / 380)) * 2.5 : 0;
            el.style.scale = String(1 + pulse);
            el.style.rotate = `${wob}deg`;
            el.style.filter = `brightness(${hit < STOP ? 3 : lerp(2, 1, eo((hit - STOP) / 300))}) saturate(${hit < STOP ? 0.2 : 1})`;
          }
          // 5. 当たってから 0.5 秒後に、ふだんの消え方へ
          if (hit >= AFTER) {
            dead.add(tg.uid);
            el.style.scale = "";
            el.style.rotate = "";
            el.style.filter = "";
            el.classList.remove("fx-judged");
            onDeath(tg.uid);
          }
        }
      });

      for (const o of others) {
        const q = push.get(o);
        o.style.translate = q ? `${q.x.toFixed(2)}px ${q.y.toFixed(2)}px` : "";
        o.style.rotate = q ? `${q.r.toFixed(2)}deg` : "";
      }
      if (arbiter) arbiter.style.translate = ax || ay ? `${ax.toFixed(2)}px ${ay.toFixed(2)}px` : "";
      const s = frozen ? 0 : shake;
      board.style.translate = s
        ? `${((Math.random() - 0.5) * s).toFixed(2)}px ${((Math.random() - 0.5) * s).toFixed(2)}px`
        : "";
      board.style.filter = frozen ? "invert(1) hue-rotate(180deg) brightness(1.4)" : "";

      return real < endReal;
    };
    requestAnimationFrame(step);
  });
}
