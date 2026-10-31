import { gsap } from "gsap";
import { FIXER_HIT, playSe } from "../sound/se";

/**
 * 『フィクサー』の差し出し：黒い閃光（見た目だけ。ルールは game-core）。オーナーと詰めたモック
 * 「『フィクサー』黒い閃光の案」（Artifact）の決定案と同じ動きと秒数。
 *
 * 差し出すキャラクター 1 体ごとに：
 * 1. 垂れる 0.3 秒：キャラクターの真上（段と段のあいだ）から、墨の黒いモヤがカードの上辺まで垂れ下がる。
 *    うしろから白い光がにじんで、黒い場の上でも形が見える（盤面が黒く滲む登場と同じ墨）
 * 2. 引き絞る 0.35 秒：モヤがだんだん速く上へ引き戻されて真上で固まり、そこに白い光が溜まる
 * 3. 突き刺す：0.6 秒から 0.25 秒かけて、太い黒い閃光が真下へ伸びる。短い先がゆっくり出て、5 乗の加速で一気に伸びる
 *    （0.05 秒で伸ばすと、等倍では最初から下まであるように見え、0.18 秒では速すぎた。0.3 秒と比べて 0.25 秒に決めた）。伸びる先は白く光る。先はカードの下辺でちょうど止まる
 * 4. 白黒が入れ替わって 0.3 秒止まる：場は白い紙、閃光とキャラクターは黒い影（盤面の .fx-fixer-flip。GSAP の時計も止める）。
 *    閃光には白い輪郭を付け、黒い影のカードに刺さっているところが見えるようにする
 * 5. 動き出す：カードが白く飛んで震え、白い筋と粒が上と横へ跳ね、盤面が強く揺れ、まわりのキャラクターも揺れる。
 *    閃光は 0.15 秒そのままで、0.25 秒で細くなって消える
 * 6. 貫いてから 0.3 秒後（止まっていた時間を除く）：onDeath で、ふだん破壊されるときと同じ消え方を始める
 * 2 体（自分と相手）でも、同じ瞬間に貫く（止まる 0.3 秒と盤面の揺れは 1 回だけ）。
 * 順にずらすと、1 体目が消えている途中に 2 体目の溜めが始まり、壊れて見えやすかったため（オーナー：「処刑するタイミング敵味方同時にして」）
 *
 * 描くのは盤面（board）の中に置いたキャンバス。キャラクターの動きは CSS の個別のプロパティ（translate・scale・rotate）で付け、
 * ほかの演出の transform とぶつからないようにする（『調停者』の突き fx/thrust.ts と同じ決まり）。
 */

const CHARGE_AT = 80; // 決まってからモヤが垂れ始めるまで
const CHARGE = 300; // モヤがカードの上辺まで垂れる
const PULL_AT = 380; // 引き戻し始め
const PULL = 350; // 引き絞る
const FIRE = 50; // 引き絞り終えてからモヤが消えるまで
const GROW_AT = 600; // 閃光が伸び始める
const GROW = 250; // 閃光が伸びる長さ（短い先がゆっくり出て、5 乗で一気に伸びる）
const HIT = GROW_AT + GROW;
const FREEZE = 300; // 白黒が入れ替わって止まる
const AFTER = 300; // 貫いてから消え始めるまで
const HOLD = 150; // 閃光がそのまま残る
const FADE = 250; // 閃光が細くなって消える
const SPARK = 520; // 白い筋と粒
const RISE = 0.7; // モヤが固まる高さ＝閃光の出どころ（カードの上辺から、カードの高さに対して）
const MISTS = 26; // モヤの玉の数
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

/** 実際の時刻 → 演出の時刻。貫いてから 0.3 秒は止まっていて、演出の時刻が進まない */
function warp(real: number) {
  if (real < HIT) return { te: real, frozen: false };
  if (real < HIT + FREEZE) return { te: HIT, frozen: true };
  return { te: real - FREEZE, frozen: false };
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

/** 伸びていく閃光の先の白い光 */
function spark(ctx: Ctx, x: number, y: number, R: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.restore();
}

/** 墨のモヤの玉 1 つ：黒い煙に、うしろから白い光がにじむ（黒い場の上でも形が見える） */
function mist(ctx: Ctx, x: number, y: number, rad: number, show: number) {
  if (show <= 0 || rad <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, rad * 0.3, x, y, rad * 1.7);
  g.addColorStop(0, `rgba(255,255,255,${0.12 * show})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - rad * 1.7, y - rad * 1.7, rad * 3.4, rad * 3.4);
  ctx.restore();
  const k = ctx.createRadialGradient(x, y, 0, x, y, rad);
  k.addColorStop(0, `rgba(0,0,0,${0.9 * show})`);
  k.addColorStop(0.6, `rgba(0,0,0,${0.6 * show})`);
  k.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = k;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * モヤを引き絞る：top（閃光の出どころ）からカードの上辺（down）までモヤが垂れ下がり、上へ引き戻されて top で固まる。
 * 引き戻す間、top に横に細長い白い光が溜まる
 */
function drawBack(
  ctx: Ctx,
  x: number,
  top: number,
  down: number,
  a: number,
  w: number,
  rnd: number[],
  now: number,
) {
  if (a < CHARGE_AT || a >= PULL_AT + PULL + FIRE) return;
  const r = (i: number) => rnd[i] ?? 0;
  const reachK = eo(seg(a, CHARGE_AT, CHARGE), 3);
  const back = ei(seg(a, PULL_AT, PULL));
  const f = 1 - seg(a, PULL_AT + PULL, FIRE);
  const bottom = lerp(top, down, reachK);
  for (let i = 0; i < MISTS; i++) {
    const v = r(i);
    const y0 = lerp(top, down, v);
    const reach = clamp((bottom - y0) / (w * 2.2));
    if (reach <= 0) continue;
    const drift = w * 0.3 * (1 - back);
    const mx = x + (r(i + MISTS) - 0.5) * w * (1.2 + 1.2 * v) + Math.sin(now / 380 + i * 1.7) * drift;
    const my = y0 + Math.cos(now / 450 + i) * drift;
    const rad = w * (0.55 + 0.8 * r(i + MISTS * 2)) * (0.5 + 0.5 * reach) * (1 - 0.35 * back);
    mist(ctx, lerp(mx, x, back), lerp(my, top + w * 0.6, back), rad, reach * f);
  }
  const k = seg(a, PULL_AT, PULL) * f;
  if (k <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const R = w * (0.6 + 1.8 * k);
  const g = ctx.createRadialGradient(x, top, 0, x, top, R);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.translate(x, top);
  ctx.scale(1.8, 0.7);
  ctx.translate(-x, -top);
  ctx.fillRect(x - R, top - R, R * 2, R * 2);
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
 * 黒い閃光を見せる。board は盤面、targets は差し出されたキャラクター（順に貫く）
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
  const endReal = HIT + SPARK + 100 + FREEZE;
  let paused = false;

  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    // 始まりに溜めの音、撃ち抜く瞬間に一撃の音
    playSe("fixerCharge");
    setTimeout(() => playSe("fixerHit"), HIT - FIXER_HIT * 1000);
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
      const { te: t, frozen } = warp(real);
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

      const push = new Map<HTMLElement, { x: number; y: number }>();
      targets.forEach((tg, i) => {
        const el = tg.el;
        const a = t;
        if (a < 0) return;
        const p = at(el);
        const rnd = rnds[i] ?? [];
        const w = p.w * WIDTH;
        // 閃光の出どころ（モヤが固まる所）
        const oy = Math.max(10, p.top - p.h * RISE);
        const after = a - HIT;
        if (a < HIT) drawBack(ctx, p.x, oy, p.top, a, w, rnd, now);
        // 閃光：モヤが固まった所から真下へ。等倍でも伸びていくのが見えるように、短い先がゆっくり出てから猛烈に加速する。先はカードの下辺で止める
        if (a >= HIT - GROW) {
          const g = seg(a, HIT - GROW, GROW);
          const tip = lerp(oy, p.bottom, ei(g, 5));
          if (g < 1 && !frozen) spark(ctx, p.x, tip, w * (1 + 1.4 * g));
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
        // まわりのキャラクターも揺れる（遠いほど遅れて弱く届く）
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
      // 盤面の揺れは 1 回だけ（2 体を同時に貫いても倍にしない）
      const shake = frozen ? 0 : shakeAt(t - HIT);
      board.style.translate = shake ? `${shake.toFixed(2)}px ${(shake * -0.5).toFixed(2)}px` : "";
      return real < endReal;
    };
    requestAnimationFrame(step);
  });
}
