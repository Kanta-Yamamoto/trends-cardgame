import { gsap } from "gsap";
import { frameRect } from "../frame";
import "./minamoLive.css";

/**
 * ミナモが場に出たときの演出。ふつうの着地の代わりに見せる（10月26日。モック「ミナモの召喚演出」の出方 1・コメント欄は横）。
 * 1. アップ（0〜0.35 秒）：場が暗くなり、カードが枠から浮いて画面の片側でアップになる。着いたところに波紋。
 *    その間にカードの絵からミナモが消えて水だけになる（泡が昇る。最初からカードの中にいるように見せないため）
 * 2. コメント欄（0.42 秒〜）：カードの横に配信のコメント欄が開き、あいさつのコメントが下から入って上へ流れる
 * 3. ひょこっ（1.0〜1.18 秒）：カードの中の上の縁から、ミナモが顔だけ出す（行き過ぎて戻る）。切り抜きは上下逆の構図なので
 *    上下を反転して顔を上向きにし、髪から下はカードの外（枠で切り取られて映らない）。しぶきと白い閃光、カードが少し沈む。
 *    コメントが一気に増え、ハートが昇り、視聴者数が増える
 * 4. 余韻（1.18〜2.3 秒）：ゆらゆら揺れながら、泡が昇り、コメントが流れ続ける
 * 5. 引っ込む（2.3〜2.46 秒）：ひょこっと引っ込み、コメント欄が閉じる。カードの絵が元に戻る
 * 6. 戻る（2.5〜2.8 秒）：カードが枠へ戻って着地。足もとに輪としぶき、小さな揺れ
 *
 * カードは出した枠が画面の左なら左でアップにし、コメント欄は右（右の枠なら逆）。
 * カードの写しを動かし、本物のカードは終わるまで隠しておく（呼ぶ側で隠す）。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

/** この演出で場に出るカードと、ミナモが消えたあとの水だけの背景の絵（仮にコードで作ったもの。描いた絵に差し替えられる） */
export const MINAMO_LIVE: Readonly<Record<string, { bg: string }>> = {
  c3: { bg: "/assets/cards/c3-bg.jpg" },
};

export interface MinamoLiveOpts {
  /** 場に出たミナモ（data-uid の要素。最終の位置に置いて隠してある） */
  unit: HTMLElement;
  /** 画面座標の演出の層 */
  layer: HTMLElement;
  /** 顔を出す絵（切り抜き）の URL */
  subject: string;
  /** 水だけの背景の絵の URL */
  bg: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eo2 = (x: number) => 1 - (1 - x) * (1 - x);
const eo3 = (x: number) => 1 - (1 - x) ** 3;
const eo5 = (x: number) => 1 - (1 - x) ** 5;
const ei2 = (x: number) => x * x;
const ei3 = (x: number) => x ** 3;
const backOut = (x: number, s = 2.4) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 時間（ms）。モックと同じ
const T_UP_END = 350;
const T_CHAT = 420;
const T_PEEK = 1000;
const T_PEEK_END = 1180;
const T_HIDE = 2300;
const T_HIDE_END = 2460;
const T_BACK = 2500;
const T_LAND = 2800;
/** カードの絵からミナモが消える・戻る */
const ART_OUT: readonly [number, number] = [120, 420];
const ART_IN: readonly [number, number] = [2440, 2700];
const END = T_LAND + 340;

/** モックの盤面の幅（360）とアップのカードの幅（150）。画面の幅に合わせて縮める */
const MW = 360;
const UP_W = 150;
/** 顔を出す深さ（カードの高さの割合。顔と手だけ） */
const SHOW = 0.3;

/** コメント（出る時刻・文・目立たせるか）。名前と色は順に当てる */
const MSGS: readonly [number, string, boolean?][] = [
  [440, "こんみな〜"],
  [560, "きたー！"],
  [690, "待ってた"],
  [830, "初見です"],
  [950, "今日もよろしく"],
  [1180, "かわいい", true],
  [1230, "888888"],
  [1280, "ひょこって出た"],
  [1340, "癒される〜", true],
  [1400, "www"],
  [1520, "尊い"],
  [1650, "髪きれい"],
  [1780, "推せる", true],
  [1900, "💙💙💙"],
  [2020, "泡すき"],
  [2140, "最高"],
  [2260, "🫧🫧"],
];
const NAMES = [
  "しずく",
  "うみねこ",
  "なぎさ",
  "ぷくぷく",
  "みずたま",
  "あわ",
  "いるか",
  "さざなみ",
  "ふね",
  "しおり",
  "こんぶ",
  "くらげ",
];
const AV = ["#5cc8f0", "#ffb3d1", "#a8f0d8", "#ffe9a8", "#c9b3ff", "#8fd8ff", "#ffd36a", "#7dffb0"];

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  ttl: number;
}
interface Bubble {
  x: number;
  y0: number;
  r: number;
  sp: number;
  ph: number;
  amp: number;
  /** 出る時刻（ms） */
  at: number;
}
interface Heart {
  x: number;
  y0: number;
  at: number;
  ttl: number;
  amp: number;
  ph: number;
  s: number;
  c: string;
}

function canvasAt(parent: HTMLElement, left: number, top: number, w: number, h: number, dpr: number) {
  const c = document.createElement("canvas");
  c.className = "ml-cv";
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  Object.assign(c.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  parent.appendChild(c);
  const g = c.getContext("2d");
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

export async function minamoLive(o: MinamoLiveOpts): Promise<void> {
  const { unit, layer, subject, bg } = o;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const f = frameRect();
  const ur = unit.getBoundingClientRect();
  const s = f.width / MW;
  /** 出した枠が画面の左なら、カードは左・コメント欄は右 */
  const leftSide = ur.left + ur.width / 2 <= f.left + f.width / 2;

  // アップのカードの位置（足もとの点と幅）と、コメント欄の箱
  const upW = UP_W * s;
  const upH = (upW * 88) / 63;
  const upCx = leftSide ? f.left + (14 + UP_W / 2) * s : f.left + f.width - (14 + UP_W / 2) * s;
  const upCy = f.top + f.height * 0.45;
  const gap = 10 * s;
  const chatW = f.width - upW - 14 * s - gap - 12 * s;
  const chat = {
    left: leftSide ? upCx + upW / 2 + gap : f.left + 12 * s,
    top: upCy - upH / 2 + upH * 0.18,
    width: chatW,
    height: upH * 0.82 + 30 * s,
  };

  // 層：暗転 → 後ろの canvas（波紋）→ カードの写し（中に顔を出すミナモ）→ コメント欄 → 手前の canvas（しぶき・泡・ハート・輪）
  const root = document.createElement("div");
  root.className = "ml-root";
  const veil = document.createElement("div");
  veil.className = "ml-veil";
  Object.assign(veil.style, {
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  root.appendChild(veil);
  const gB = canvasAt(root, f.left, f.top, f.width, f.height, dpr);

  const up = document.createElement("div");
  up.className = "ml-up";
  Object.assign(up.style, {
    left: `${ur.left}px`,
    top: `${ur.top}px`,
    width: `${ur.width}px`,
    height: `${ur.height}px`,
  });
  const card = unit.cloneNode(true) as HTMLElement;
  // 場に出たときの落ちてくる動き（.enter）を写しでやり直さないように外す
  card.classList.remove("enter");
  card.removeAttribute("data-uid");
  card.style.opacity = "1";
  // 水だけの背景を絵の上に重ねる（透明度でミナモが消えた・戻ったを見せる）
  const bgEl = document.createElement("div");
  bgEl.className = "ml-bg";
  bgEl.style.setProperty("--ml-bg", `url("${bg}")`);
  // 顔を出すミナモ（カードの中。枠で切り取られる）
  const peek = document.createElement("div");
  peek.className = "ml-subj";
  peek.style.setProperty("--ml-subject", `url("${subject}")`);
  card.prepend(peek);
  card.prepend(bgEl);
  up.appendChild(card);
  root.appendChild(up);

  const chatEl = document.createElement("div");
  chatEl.className = "ml-chat";
  Object.assign(chatEl.style, {
    left: `${chat.left}px`,
    top: `${chat.top}px`,
    width: `${chat.width}px`,
    height: `${chat.height}px`,
  });
  const hd = document.createElement("div");
  hd.className = "ml-chat-hd";
  hd.appendChild(document.createElement("i"));
  hd.appendChild(document.createTextNode("ライブ"));
  const viewers = document.createElement("em");
  hd.appendChild(viewers);
  chatEl.appendChild(hd);
  const body = document.createElement("div");
  body.className = "ml-chat-body";
  const fade = document.createElement("div");
  fade.className = "ml-chat-fade";
  body.appendChild(fade);
  const ls = document.createElement("div");
  ls.className = "ml-chat-ls";
  body.appendChild(ls);
  chatEl.appendChild(body);
  root.appendChild(chatEl);
  const rows = MSGS.map(([at, text, sup], i) => {
    const el = document.createElement("div");
    el.className = "ml-msg";
    el.hidden = true;
    const av = document.createElement("i");
    av.style.background = AV[(i * 5) % AV.length] ?? "#5cc8f0";
    const name = NAMES[i % NAMES.length] ?? "";
    av.textContent = name.slice(0, 1);
    const b = document.createElement("b");
    if (i % 4 === 1) b.classList.add("member");
    b.textContent = name;
    const t = document.createElement("span");
    if (sup) t.classList.add("sup");
    t.textContent = text;
    const wrap = document.createElement("span");
    wrap.append(b, t);
    el.append(av, wrap);
    ls.appendChild(el);
    return { at, el, h: 0 };
  });

  const gF = canvasAt(root, f.left, f.top, f.width, f.height, dpr);
  root.lastElementChild?.classList.add("front");
  layer.appendChild(root);
  const board = document.querySelector<HTMLElement>(".board");
  const boardTransform = board?.style.transform ?? "";
  if (!gB || !gF) {
    root.remove();
    return;
  }

  // 粒：しぶき・泡・ハート
  let drops: Drop[] = [];
  const bubbles: Bubble[] = [];
  let hearts: Heart[] = [];
  const spawnDrops = (cx: number, cy: number, w: number, n: number, spread: number) => {
    const r = rng(Math.floor(cx + cy) * 7 + n);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * spread;
      const v = (0.5 + r() * 0.9) * w * 0.028;
      drops.push({
        x: cx + (r() - 0.5) * w * 0.8,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: (1.2 + r() * 2.2) * s,
        life: 0,
        ttl: 380 + r() * 300,
      });
    }
  };
  const spawnBubbles = (cx: number, cy: number, w: number, at: number, n: number) => {
    const r = rng(99 + n);
    for (let i = 0; i < n; i++)
      bubbles.push({
        x: cx + (r() - 0.5) * w * 1.3,
        y0: cy + r() * w * 0.4,
        r: (1.5 + r() * 3) * s,
        sp: (14 + r() * 18) * s,
        ph: r() * 6.28,
        amp: (3 + r() * 4) * s,
        at: at + r() * 1200,
      });
  };
  const spawnHearts = () => {
    const r = rng(5);
    hearts = [];
    for (let i = 0; i < 9; i++)
      hearts.push({
        x: chat.left + chat.width - 14 * s - r() * 10 * s,
        y0: chat.top + chat.height - 8 * s,
        at: T_PEEK_END + r() * 1100,
        ttl: 900 + r() * 500,
        amp: (6 + r() * 6) * s,
        ph: r() * 6.28,
        s: (7 + r() * 4) * s,
        c: r() < 0.35 ? "#ffb3d1" : "#5cc8f0",
      });
  };

  /** カードの写し：枠 → アップ → 枠。足もと（枠の下の真ん中）を軸に、動かして拡大する */
  const slotCx = ur.left + ur.width / 2;
  const slotBottom = ur.bottom;
  const cardPose = (t: number) => {
    let x: number;
    let y: number;
    let w: number;
    let sx = 1;
    let sy = 1;
    if (t < T_UP_END) {
      const p = eo3(seg(t, 0, T_UP_END));
      w = ur.width + (upW - ur.width) * p;
      x = slotCx + (upCx - slotCx) * p;
      y = slotBottom + (upCy + upH / 2 - slotBottom) * p - Math.sin(p * Math.PI) * 22 * s;
    } else if (t < T_BACK) {
      w = upW;
      x = upCx;
      y = upCy + upH / 2;
      // ひょこっの瞬間、カードが少しだけ沈んで戻る
      if (t >= T_PEEK_END - 40) {
        const p = seg(t, T_PEEK_END - 40, T_PEEK_END + 260);
        sy = 1 - 0.035 * Math.sin(p * Math.PI);
        sx = 1 + 0.02 * Math.sin(p * Math.PI);
      }
    } else {
      const p = ei2(seg(t, T_BACK, T_LAND));
      w = upW + (ur.width - upW) * p;
      x = upCx + (slotCx - upCx) * p;
      y = upCy + upH / 2 + (slotBottom - (upCy + upH / 2)) * p;
      if (t >= T_LAND) {
        // 着地：つぶれて、弾んで戻る
        sx =
          t < T_LAND + 40
            ? 1 + 0.1 * eo2(seg(t, T_LAND, T_LAND + 40))
            : 1 + 0.1 * (1 - backOut(seg(t, T_LAND + 40, T_LAND + 380), 3));
        sy = 2 - sx;
      }
    }
    const k = w / ur.width;
    up.style.transform = `translate(${x - slotCx}px, ${y - slotBottom}px) scale(${k * sx}, ${k * sy})`;
    // 絵：ミナモが消えて水だけになり、引っ込んだあとに戻る
    const out = eo2(seg(t, ART_OUT[0], ART_OUT[1]));
    const back = eo2(seg(t, ART_IN[0], ART_IN[1]));
    bgEl.style.opacity = String(out * (1 - back));
    return { x, y, w, h: (w * 88) / 63 };
  };

  /** カードの中のミナモ。-1 = 上の縁の外に隠れている、-1+SHOW = 顔だけ出している（上下を反転してあるので、顔が上向きで下りてくる） */
  const peekPose = (t: number) => {
    let y = -1;
    let sway = 0;
    if (t < T_PEEK) y = -1;
    else if (t < T_PEEK_END) y = -1 + SHOW * backOut(seg(t, T_PEEK, T_PEEK_END), 2.6);
    else if (t < T_HIDE) {
      const ts = (t - T_PEEK_END) / 1000;
      y = -1 + SHOW + Math.sin(ts * 1.8) * 0.012;
      sway = Math.sin(ts * 2.6) * 2.2;
    } else if (t < T_HIDE_END) y = -1 + SHOW * (1 - ei3(seg(t, T_HIDE, T_HIDE_END)));
    peek.style.transform = `translate(${sway}%, ${y * 100}%) scaleY(-1)`;
  };

  /** コメント欄：開いて、行が下から入り、閉じる */
  const chatPose = (t: number) => {
    const open = eo3(seg(t, T_CHAT, T_CHAT + 220));
    const close = 1 - seg(t, T_HIDE + 40, T_HIDE + 300);
    chatEl.style.opacity = String(open * close);
    chatEl.style.transform = `translateY(${(1 - open) * 14 * s}px) scale(${0.96 + 0.04 * open})`;
    // 視聴者数：ひょこっで増える
    const n = 8120 + Math.round(1260 * seg(t, T_PEEK_END, T_PEEK_END + 900));
    viewers.textContent = `${n.toLocaleString("ja-JP")} 人`;
    let latest: (typeof rows)[number] | null = null;
    for (const r of rows) {
      const on = t >= r.at;
      if (on && r.el.hidden) {
        r.el.hidden = false;
        r.h = r.el.offsetHeight + 5 * s;
      } else if (!on && !r.el.hidden) r.el.hidden = true;
      if (on) latest = r;
      r.el.style.opacity = "1";
    }
    if (latest) {
      // 新しい行の高さだけ一覧を下げておき、入ってくるのに合わせて上へ流す
      const p = eo3(seg(t - latest.at, 0, 200));
      ls.style.transform = `translateY(${latest.h * (1 - p)}px)`;
      latest.el.style.opacity = String(p);
    } else ls.style.transform = "";
  };

  let prevT = -1;
  const drawFx = (t: number, cd: { x: number; y: number; w: number; h: number }) => {
    gB.clearRect(0, 0, f.width, f.height);
    gF.clearRect(0, 0, f.width, f.height);
    const ox = f.left;
    const oy = f.top;
    // アップになって着いたときの波紋（後ろ）
    const rp = seg(t, T_UP_END - 60, T_UP_END + 700);
    if (rp > 0 && rp < 1) {
      gB.save();
      gB.globalCompositeOperation = "lighter";
      gB.translate(cd.x - ox, cd.y - oy - cd.h * 0.1);
      gB.scale(1, 0.5);
      for (let i = 0; i < 3; i++) {
        const q = clamp(rp * 1.3 - i * 0.15);
        if (q <= 0) continue;
        gB.beginPath();
        gB.arc(0, 0, cd.w * (0.5 + q * 1.1), 0, Math.PI * 2);
        gB.strokeStyle = `rgba(92,200,240,${(1 - q) * 0.55})`;
        gB.lineWidth = (3 - 2 * q) * s;
        gB.stroke();
      }
      gB.restore();
    }
    const dt = prevT < 0 ? 16 : Math.max(0, t - prevT);
    // しぶき：ひょこっの瞬間（カードの上の縁）と着地の瞬間（足もと）
    if (prevT < T_PEEK_END - 120 && t >= T_PEEK_END - 120)
      spawnDrops(cd.x, cd.y - cd.h * (1 - SHOW), cd.w * 0.8, 18, 2.4);
    if (prevT < T_LAND && t >= T_LAND) spawnDrops(cd.x, cd.y, cd.w, 16, 2.6);
    if (prevT < ART_OUT[0] && t >= ART_OUT[0]) spawnBubbles(cd.x, cd.y - cd.h * 0.5, cd.w, ART_OUT[0], 8);
    if (prevT < T_PEEK_END && t >= T_PEEK_END) {
      spawnBubbles(cd.x, cd.y - cd.h * 0.9, cd.w, T_PEEK_END, 10);
      spawnHearts();
    }
    gF.save();
    gF.globalCompositeOperation = "lighter";
    for (const d of drops) {
      d.life += dt;
      d.x += (d.vx * dt) / 16;
      d.y += (d.vy * dt) / 16;
      d.vy += (0.09 * s * dt) / 16;
      const a = 1 - d.life / d.ttl;
      if (a <= 0) continue;
      gF.beginPath();
      gF.arc(d.x - ox, d.y - oy, d.r, 0, Math.PI * 2);
      gF.fillStyle = `rgba(200,240,255,${a * 0.95})`;
      gF.fill();
    }
    drops = drops.filter((d) => d.life < d.ttl);
    for (const b of bubbles) {
      const tl = t - b.at;
      if (tl < 0) continue;
      const y = b.y0 - (b.sp * tl) / 1000 - oy;
      const x = b.x + Math.sin(tl / 400 + b.ph) * b.amp - ox;
      const a = clamp(tl / 200) * clamp(1 - (tl - 1100) / 500) * 0.7;
      if (a <= 0) continue;
      gF.beginPath();
      gF.arc(x, y, b.r, 0, Math.PI * 2);
      gF.strokeStyle = `rgba(190,235,255,${a})`;
      gF.lineWidth = s;
      gF.stroke();
      gF.beginPath();
      gF.arc(x - b.r * 0.3, y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
      gF.fillStyle = `rgba(255,255,255,${a})`;
      gF.fill();
    }
    // ハート（コメント欄の右端から昇る）
    for (const h of hearts) {
      const tl = t - h.at;
      if (tl < 0 || tl > h.ttl) continue;
      const p = tl / h.ttl;
      gF.save();
      gF.translate(h.x + Math.sin(p * 6 + h.ph) * h.amp - ox, h.y0 - p * 110 * s - oy);
      gF.scale(h.s / 10, h.s / 10);
      gF.globalAlpha = Math.min(1, p * 5) * (1 - p);
      gF.fillStyle = h.c;
      gF.beginPath();
      gF.moveTo(0, 4);
      gF.bezierCurveTo(-8, -4, -4, -11, 0, -6);
      gF.bezierCurveTo(4, -11, 8, -4, 0, 4);
      gF.fill();
      gF.restore();
    }
    // ひょこっの瞬間の白い閃光（カードの上の縁）
    const fl = t >= T_PEEK_END - 40 ? 1 - seg(t, T_PEEK_END - 40, T_PEEK_END + 220) : 0;
    if (fl > 0) {
      const cx = cd.x - ox;
      const cy = cd.y - oy - cd.h * (1 - SHOW);
      const g = gF.createRadialGradient(cx, cy, 0, cx, cy, cd.w * 0.6);
      g.addColorStop(0, `rgba(255,255,255,${fl * 0.8})`);
      g.addColorStop(1, "rgba(120,210,255,0)");
      gF.fillStyle = g;
      gF.fillRect(cx - cd.w, cy - cd.h * 0.6, cd.w * 2, cd.h);
    }
    // 着地の輪（足もと）
    const lr = seg(t, T_LAND, T_LAND + 520);
    if (lr > 0 && lr < 1) {
      gF.save();
      gF.translate(cd.x - ox, cd.y - oy - 3 * s);
      gF.scale(1, 0.34);
      const rad = ur.width * (0.35 + eo5(lr));
      gF.lineWidth = (6 - 5 * lr) * s;
      gF.strokeStyle = `rgba(92,200,240,${1 - lr})`;
      gF.beginPath();
      gF.arc(0, 0, rad, 0, Math.PI * 2);
      gF.stroke();
      gF.lineWidth = (14 - 10 * lr) * s;
      gF.strokeStyle = `rgba(255,255,255,${(1 - lr) * 0.25})`;
      gF.beginPath();
      gF.arc(0, 0, rad, 0, Math.PI * 2);
      gF.stroke();
      gF.restore();
    }
    gF.restore();
    prevT = t;
  };

  const render = (t: number) => {
    const dark = 0.72 * eo2(seg(t, 0, 350)) * (1 - ei2(seg(t, T_BACK, T_LAND + 100)));
    veil.style.opacity = String(dark);
    const cd = cardPose(t);
    peekPose(t);
    chatPose(t);
    drawFx(t, cd);
    // 着地の小さな揺れ
    const sh = t >= T_LAND ? (1 - seg(t, T_LAND, T_LAND + 180)) * 0.5 : 0;
    const shakeT =
      sh > 0 ? `translate(${Math.sin(t * 0.09) * 5 * sh * s}px, ${Math.cos(t * 0.117) * 3 * sh * s}px)` : "";
    root.style.transform = shakeT;
    if (board) board.style.transform = shakeT || boardTransform;
  };

  try {
    render(0);
    await new Promise<void>((resolve) => {
      const st = { t: 0 };
      gsap.to(st, {
        t: END,
        duration: END / 1000,
        ease: "none",
        onUpdate: () => render(st.t),
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  } finally {
    if (board) board.style.transform = boardTransform;
    root.remove();
  }
}
