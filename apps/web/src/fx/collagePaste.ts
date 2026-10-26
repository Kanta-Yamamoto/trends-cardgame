import { gsap } from "gsap";
import { frameRect } from "../frame";

/**
 * 伝説のコラ画像が場に出たときの演出。ふつうの着地の代わりに見せる（10月26日、オーナーがモックで決めた「案1 と案3 の折衷」）。
 * 1. 叩きつけ（0〜0.32 秒）：白く光ったカードが少し上で溜めて、枠へ叩きつける（時間割は fieldEntry と同じ）
 * 2. 剥がしても剥がしても（0.45 秒〜）：カードの角がめくれて 1 枚剥がれ飛び、下に同じカード → また剥がれる。合計 30 枚。
 *    最初は 240 ミリ秒おきに 1 枚ずつ読める速さ、間隔を 0.76 倍ずつ詰めて最後は 55 ミリ秒おきの紙の嵐（1 秒に 18 枚）。
 *    めくれた紙は白い裏を見せて飛ぶ。1 枚のめくれは 150 ミリ秒より短くしない（短いと、めくれが見えずカード本体ばかりに見える）
 * 3. 貼り重ね：1 枚めくれるたびに、カードの中から新聞・写真・ライム・網点の切れ端が飛び出し、着地点に近いところから画面を貼り埋めていく。
 *    貼られた広さに合わせて場がライムに染まる。嵐が強いほど下のカードが震えて光る
 * 4. 最後の 1 枚が剥がれた瞬間（約 2.7 秒）：残った 1 枚が強く光って輪が広がり、盤面が揺れる。場は一面のコラージュ
 * 5. 余韻 0.55 秒のあと、遠い切れ端から剥がれて飛び去り、元の盤面に戻る（全体で約 3.9 秒）
 *
 * 本物のカードは終わるまで隠しておき（呼ぶ側で隠す）、暗い層の上に写しを置いて動かす。
 * 切れ端は、影まで焼き込んだ小さな絵を先に作り、毎コマは貼るだけ（1x 再生で 60fps）。
 * 時間は GSAP で数える（開発中に __gsap で遅くしても、全部が同じ速さで遅くなる）
 */

/** この演出で場に出るカード（伝説のコラ画像と、呪いのコラ画像が手札に加える写し） */
export const COLLAGE_PASTE: ReadonlySet<string> = new Set(["k5", "t-kora"]);

export interface CollagePasteOpts {
  /** 場に出たカード（data-uid の要素。最終の位置に置いて隠してある） */
  unit: HTMLElement;
  /** 画面座標の演出の層 */
  layer: HTMLElement;
  /** 写真の切れ端に使う絵（カードの背景の絵の URL） */
  art?: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eo2 = (x: number) => 1 - (1 - x) * (1 - x);
const eo3 = (x: number) => 1 - (1 - x) ** 3;
const eo5 = (x: number) => 1 - (1 - x) ** 5;
const io2 = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const ei4 = (x: number) => x ** 4;
const backOut = (x: number, s = 3) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// モックの盤面（360×660）とカードの幅（62）。画面の大きさに合わせて縮める
const MW = 360;
const CARD_W = 62;
/** めくる枚数 */
const SHEETS = 30;
/** 叩きつけの衝撃の時刻（ms） */
const IMPACT = 320;

interface Peel {
  /** めくれ始め・剥がれる瞬間・飛び去る時間（ms） */
  a: number;
  b: number;
  fly: number;
  /** 飛ぶ向き（モックの px）・回転（度）・上下のぶれ */
  dx: number;
  dy: number;
  rot: number;
  lift: number;
}

/** 30 枚の時刻。最初は 240 ミリ秒おき、0.76 倍ずつ詰めて最後は 55 ミリ秒おき */
function buildPeels(r: () => number): Peel[] {
  const peels: Peel[] = [];
  let at = 450;
  let gap = 240;
  for (let i = 0; i < SHEETS; i++) {
    const dur = Math.max(150, 340 * 0.85 ** i);
    const fly = Math.max(220, 420 * 0.9 ** i);
    peels.push({
      a: at,
      b: at + dur,
      fly,
      dx: 60 + r() * 80,
      dy: -(50 + r() * 90),
      rot: 10 + r() * 50,
      lift: (r() - 0.5) * 30,
    });
    at += gap;
    gap = Math.max(55, gap * 0.76);
  }
  return peels;
}

/** 破った紙の縁 */
function tornPath(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  const n = 7;
  g.beginPath();
  for (let e = 0; e < 4; e++) {
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const rough = r() * 0.08;
      const [x, y] =
        e === 0
          ? [k * w, rough * h]
          : e === 1
            ? [w - rough * w, k * h]
            : e === 2
              ? [w - k * w, h - rough * h]
              : [rough * w, h - k * h];
      if (e === 0 && i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }
  g.closePath();
}

type ScrapKind = "news" | "lime" | "pink" | "half" | "photo";
const SCRAP_KINDS: readonly ScrapKind[] = [
  "news",
  "news",
  "photo",
  "lime",
  "news",
  "photo",
  "half",
  "news",
  "photo",
  "lime",
  "news",
  "pink",
];

/** 切れ端の絵（影まで焼き込む。毎コマ shadowBlur を掛けると重い）。w・h は画面の px */
function makeScrap(
  kind: ScrapKind,
  w: number,
  h: number,
  seed: number,
  dpr: number,
  art: HTMLImageElement | null,
) {
  const r = rng(seed);
  const PAD = Math.ceil(6 * (w / 40));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((w + PAD * 2) * dpr));
  c.height = Math.max(1, Math.round((h + PAD * 2) * dpr));
  const g = c.getContext("2d");
  if (!g) return { canvas: c, pad: PAD };
  g.scale(dpr, dpr);
  g.translate(PAD, PAD - 1);
  g.save();
  g.shadowColor = "#000a";
  g.shadowBlur = 5 * (w / 40);
  g.shadowOffsetY = 3 * (w / 40);
  g.fillStyle = "#e9e4d6";
  tornPath(g, w, h, rng(seed));
  g.fill();
  g.restore();
  tornPath(g, w, h, r);
  g.save();
  g.clip();
  const u = w / 40; // 1 単位（モックの 1px ぶん）
  if (kind === "news") {
    g.fillStyle = "#ebe6d8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#00000022";
    for (let y = 3 * u; y < h; y += 4.2 * u) g.fillRect(2 * u, y, w - 4 * u, 0.9 * u);
    g.fillStyle = "#111";
    g.fillRect(3 * u, 2 * u, w * (0.4 + r() * 0.4), 3 * u);
  } else if (kind === "lime") {
    g.fillStyle = "#8cff3f";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffffff55";
    for (let y = 0; y < h; y += 5 * u)
      for (let x = Math.round(y / (5 * u)) % 2 ? 2.5 * u : 0; x < w; x += 5 * u) {
        g.beginPath();
        g.arc(x, y, 1.1 * u, 0, Math.PI * 2);
        g.fill();
      }
  } else if (kind === "pink") {
    g.fillStyle = "#ff3fd0";
    g.fillRect(0, 0, w, h);
  } else if (kind === "half") {
    g.fillStyle = "#f6f1e4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#25520c";
    for (let y = 0; y < h; y += 4 * u)
      for (let x = 0; x < w; x += 4 * u) {
        g.beginPath();
        g.arc(x, y, (0.6 + 1.2 * (x / w)) * u, 0, Math.PI * 2);
        g.fill();
      }
  } else if (art?.complete && art.naturalWidth) {
    // 写真：カードの絵の一部を切り出す
    const sw = art.naturalWidth * 0.35;
    const sh = sw * (h / w);
    g.drawImage(art, r() * (art.naturalWidth - sw), r() * (art.naturalHeight - sh), sw, sh, 0, 0, w, h);
  } else {
    g.fillStyle = "#9ec9ff";
    g.fillRect(0, 0, w, h);
  }
  g.restore();
  tornPath(g, w, h, rng(seed));
  g.lineWidth = u;
  g.strokeStyle = "#ffffffcc";
  g.stroke();
  return { canvas: c, pad: PAD };
}

/** マスキングテープ。w は画面の px */
function drawTape(g: CanvasRenderingContext2D, x: number, y: number, w: number, ang: number, a: number) {
  const u = w / 36;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.globalAlpha = a;
  g.fillStyle = "#f3ffd6dd";
  g.beginPath();
  g.moveTo(-w / 2, -4 * u);
  g.lineTo(w / 2 - u, -3.6 * u);
  g.lineTo(w / 2, -u);
  g.lineTo(w / 2 - 1.2 * u, 1.5 * u);
  g.lineTo(w / 2, 4 * u);
  g.lineTo(-w / 2 + u, 3.6 * u);
  g.lineTo(-w / 2, u);
  g.lineTo(-w / 2 + 1.2 * u, -1.5 * u);
  g.closePath();
  g.fill();
  g.fillStyle = "#c9e6a055";
  for (let i = -w / 2 + 2 * u; i < w / 2; i += 4 * u) g.fillRect(i, -4 * u, 2 * u, 8 * u);
  g.restore();
}

/** カードの動き（叩きつけ。fieldEntry と同じ時間割）。lift はモックの px */
function slam(t: number) {
  const lift = 50;
  const t1 = 220;
  const t2 = t1 + 100;
  const t3 = t2 + 40;
  const t4 = t3 + 70;
  const t5 = t4 + 350;
  if (t < t1) {
    const k = eo2(seg(t, 0, t1));
    return { o: k, y: -lift - 8 * k, sx: 1.2 + 0.08 * k, sy: 1.2 + 0.08 * k, br: 1.8 };
  }
  if (t < t2) {
    const k = ei4(seg(t, t1, t2));
    return { o: 1, y: (-lift - 8) * (1 - k), sx: 1.28 - 0.28 * k, sy: 1.28 - 0.28 * k, br: 1.8 };
  }
  if (t < t3) {
    const k = eo2(seg(t, t2, t3));
    return { o: 1, y: 0, sx: 1 + 0.1 * k, sy: 1 - 0.1 * k, br: 1.8 + 0.4 * k };
  }
  if (t < t4) return { o: 1, y: 0, sx: 1.1, sy: 0.9, br: 2.2 };
  const b = backOut(seg(t, t4, t5));
  return { o: 1, y: 0, sx: 1.1 - 0.1 * b, sy: 0.9 + 0.1 * b, br: 2.2 - 1.2 * eo2(seg(t, t4, t4 + 400)) };
}

/** カードの写し（本物と同じ見た目で、好きに動かせる） */
function cloneUnit(unit: HTMLElement, ur: DOMRect, abs: boolean) {
  const el = unit.cloneNode(true) as HTMLElement;
  el.classList.remove("enter");
  el.removeAttribute("data-uid");
  el.removeAttribute("id");
  Object.assign(el.style, {
    position: "absolute",
    margin: "0",
    left: abs ? `${ur.left}px` : "0",
    top: abs ? `${ur.top}px` : "0",
    width: `${ur.width}px`,
    height: `${ur.height}px`,
    animation: "none",
    transition: "none",
    opacity: "1",
    transform: "none",
    filter: "none",
    boxShadow: "none",
    pointerEvents: "none",
  });
  return el;
}

/** 絵を読み込む（キャッシュ）。120 ミリ秒だけ待ち、間に合わなければ写真の切れ端は空色にする */
const arts = new Map<string, HTMLImageElement>();
async function loadArt(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null;
  let img = arts.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    arts.set(url, img);
  }
  if (img.complete && img.naturalWidth) return img;
  await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 120))]);
  return img;
}

export async function collagePaste(o: CollagePasteOpts): Promise<void> {
  const { unit, layer } = o;
  const art = await loadArt(o.art);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const f = frameRect();
  const ur = unit.getBoundingClientRect();
  /** モックの盤面から画面への倍率（横）と、カードの倍率 */
  const sw = f.width / MW;
  const k = ur.width / CARD_W;
  const CX = ur.left + ur.width / 2;
  const CY = ur.top + ur.height / 2;
  const FEET = ur.bottom - 4 * k;
  const r = rng(44);

  const peels = buildPeels(r);
  const LAST = peels[SHEETS - 1]?.b ?? 2700;
  const HOLD_END = LAST + 550;
  const END = LAST + 1250;

  // 層：切れ端と光のキャンバス → 叩きつけるカードの写し → めくれる紙
  const root = document.createElement("div");
  Object.assign(root.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(f.width * dpr));
  canvas.height = Math.max(1, Math.round(f.height * dpr));
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${f.left}px`,
    top: `${f.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
  });
  root.appendChild(canvas);
  const g = canvas.getContext("2d");
  const card = cloneUnit(unit, ur, true);
  card.style.opacity = "0";
  card.style.transformOrigin = "50% 100%";
  root.appendChild(card);
  // めくれる紙：表（カードの写し）と裏（白い紙）を背中合わせにしたもの。同時に見える枚数ぶんだけ用意して使い回す。
  // 半透明は表と裏それぞれに掛ける（包む要素を半透明にすると 3D が平らにつぶれ、飛ぶ紙が表に戻ってしまう）
  const pool = Array.from({ length: 24 }, () => {
    const w = document.createElement("div");
    Object.assign(w.style, {
      position: "absolute",
      left: `${ur.left}px`,
      top: `${ur.top}px`,
      width: `${ur.width}px`,
      height: `${ur.height}px`,
      transformOrigin: "0 0",
      transformStyle: "preserve-3d",
      visibility: "hidden",
    });
    const front = cloneUnit(unit, ur, false);
    front.style.backfaceVisibility = "hidden";
    const back = document.createElement("div");
    Object.assign(back.style, {
      position: "absolute",
      inset: "0",
      borderRadius: getComputedStyle(unit).borderRadius || "10px",
      background:
        "repeating-linear-gradient(180deg, transparent 0 4px, #00000012 4px 4.6px), linear-gradient(160deg, #f8f4ea, #e4ddcb)",
      transform: "rotateY(180deg)",
      backfaceVisibility: "hidden",
      boxShadow: "inset 0 0 0 1px #0002",
    });
    w.append(front, back);
    root.appendChild(w);
    return w;
  });
  layer.appendChild(root);
  const board = document.querySelector<HTMLElement>(".board");
  const boardTransform = board?.style.transform ?? "";
  if (!g) {
    root.remove();
    return;
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 切れ端：画面を埋める場所を着地点に近い順に並べ、1 枚剥がれるごとに近いほうから数個ずつ、カードの中から飛んで貼られる
  const sprites = SCRAP_KINDS.map((kind, i) =>
    makeScrap(
      kind,
      ((kind === "pink" ? 22 : 36) + ((i * 37) % 34)) * sw,
      ((kind === "pink" ? 14 : 26) + ((i * 23) % 26)) * sw,
      100 + i,
      dpr,
      art,
    ),
  );
  const cols = 8;
  const rowH = 56 * sw;
  const rows = Math.ceil(f.height / rowH) + 1;
  interface Piece {
    x: number;
    y: number;
    d: number;
    rot: number;
    img: (typeof sprites)[number];
    from: number;
    start: number;
  }
  const pieces: Piece[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const img = sprites[Math.floor(r() * sprites.length)];
    if (!img) continue;
    const x = f.left + ((i % cols) * 47 - 4 + (r() - 0.5) * 26) * sw;
    const y = f.top + Math.floor(i / cols) * rowH + (-6 + (r() - 0.5) * 30) * sw;
    const cx = x + 22 * sw;
    const cy = y + 16 * sw;
    pieces.push({
      x,
      y,
      d: Math.hypot(cx - CX, cy - CY),
      rot: (r() - 0.5) * 0.9,
      img,
      from: Math.atan2(cy - CY, cx - CX),
      start: 0,
    });
  }
  pieces.sort((p, q) => p.d - q.d);
  const maxD = pieces[pieces.length - 1]?.d ?? 1;
  const per = Math.ceil(pieces.length / SHEETS);
  pieces.forEach((p, i) => {
    const pl = peels[Math.min(SHEETS - 1, Math.floor(i / per))];
    if (pl) p.start = pl.b - 60 + (i % per) * 35 + r() * 20;
  });
  // テープは、貼られた切れ端の上に打つ
  const tapes: { x: number; y: number; w: number; ang: number; at: number }[] = [];
  for (let i = 9; i < pieces.length; i += 11) {
    const q = pieces[i];
    if (!q) continue;
    tapes.push({
      x: q.x + (18 + r() * 10) * sw,
      y: q.y + (8 + r() * 10) * sw,
      w: (26 + r() * 20) * sw,
      ang: (r() - 0.5) * 1.4,
      at: q.start + 300,
    });
  }

  const drawScrap = (
    img: (typeof sprites)[number],
    x: number,
    y: number,
    rot: number,
    sc: number,
    a: number,
  ) => {
    const w = img.canvas.width / dpr;
    const h = img.canvas.height / dpr;
    g.save();
    g.globalAlpha = a;
    g.translate(x + w / 2, y + h / 2);
    g.rotate(rot);
    g.scale(sc, sc);
    g.drawImage(img.canvas, -w / 2, -h / 2, w, h);
    g.restore();
  };

  const ring = (p: number) => {
    if (p < 0 || p >= 1) return;
    g.save();
    g.translate(CX - f.left, FEET - f.top);
    g.scale(1, 0.34);
    const a = 1 - p;
    const rad = CARD_W * k * (0.35 + eo5(p));
    g.lineWidth = (6 - 5 * p) * k;
    g.strokeStyle = `rgba(140,255,63,${a})`;
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = (14 - 10 * p) * k;
    g.strokeStyle = `rgba(255,255,255,${a * 0.25})`;
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  };

  const shakeOf = (t: number, at: number, amp: number, len: number) => {
    if (t < at || t > at + len) return "";
    const kk = 1 - seg(t, at, at + len);
    const ts = t / 1000;
    return `translate(${Math.sin(ts * 90) * amp * kk * sw}px, ${Math.cos(ts * 117) * amp * 0.6 * kk * sw}px)`;
  };

  const render = (t: number) => {
    g.clearRect(0, 0, f.width, f.height);
    const c = slam(t);
    const out = seg(t, HOLD_END, END);

    // 切れ端：カードの真ん中から飛んで貼られる → 最後は遠いものから剥がれて飛び去る
    let pasted = 0;
    for (const p of pieces) {
      const kk = eo3(seg(t, p.start, p.start + 260));
      if (kk <= 0) continue;
      if (kk >= 1) pasted++;
      const x0 = CX - f.left - 22 * sw;
      const y0 = CY - f.top - 16 * sw;
      let x = x0 + (p.x - f.left - x0) * kk;
      let y = y0 + (p.y - f.top - y0) * kk;
      let rot = p.rot + (1 - kk) * 2.5;
      const sc = 0.5 + 0.8 * kk - 0.3 * kk * kk;
      let a = 1;
      if (out > 0) {
        const o = eo2(seg(out, (p.d / maxD) * 0.6, (p.d / maxD) * 0.6 + 0.4));
        x += Math.cos(p.from) * 180 * sw * o;
        y += Math.sin(p.from) * 180 * sw * o - 40 * sw * o;
        rot += 1.5 * o;
        a = 1 - o;
      }
      if (a > 0) drawScrap(p.img, x, y, rot, sc, a);
    }
    for (const tp of tapes) {
      const kk = eo3(seg(t, tp.at, tp.at + 120));
      if (kk > 0 && out < 0.5)
        drawTape(g, tp.x - f.left, tp.y - f.top, tp.w, tp.ang, Math.min(1, kk) * (1 - out * 2));
    }

    // 剥がれる紙
    let used = 0;
    let topK = 0;
    let pop = 0;
    let recent = 0;
    for (const p of peels) {
      if (t >= p.b && t < p.b + 220) pop = Math.max(pop, 1 - seg(t, p.b, p.b + 220));
      if (t >= p.b - 200 && t < p.b) recent++; // 直近 0.2 秒で剥がれる枚数（嵐の強さ）
      if (t < p.a || t >= p.b + p.fly) continue;
      const s = pool[used++];
      if (!s) break;
      s.style.visibility = "visible";
      const kk = io2(seg(t, p.a, p.b)); // 角が持ち上がり、半分を過ぎると裏返って剥がれる
      const fly = eo2(seg(t, p.b, p.b + p.fly));
      if (fly === 0) topK = Math.max(topK, kk);
      for (const ch of s.children) (ch as HTMLElement).style.opacity = String(1 - fly);
      s.style.transform = `perspective(${300 * k}px) translate(${(p.dx * fly + 8 * kk) * k}px, ${(p.dy * fly - 6 * kk + p.lift * fly) * k}px) rotate(${p.rot * fly}deg) rotate3d(1, -1, 0, ${-130 * kk - 50 * fly}deg)`;
    }
    for (let i = used; i < pool.length; i++) {
      const s = pool[i];
      if (s) s.style.visibility = "hidden";
    }
    // めくれている間、下のカードに角の影
    if (topK > 0) {
      g.save();
      g.globalAlpha = 0.35 * topK;
      g.fillStyle = "#000";
      g.beginPath();
      g.moveTo(ur.left - f.left, ur.top - f.top);
      g.lineTo(ur.left - f.left + ur.width * (1 - topK), ur.top - f.top);
      g.lineTo(ur.left - f.left, ur.top - f.top + ur.height * (1 - topK));
      g.closePath();
      g.fill();
      g.restore();
    }

    // 嵐が強いほど下のカードが震えて明るくなり、最後の 1 枚で強く光る
    const storm = clamp(recent / 6);
    const final = t >= LAST ? 1 - seg(t, LAST, LAST + 450) : 0;
    const sc = 1 + 0.06 * eo2(pop) * (1 - storm * 0.5) + 0.1 * final;
    const jx = Math.sin(t * 0.9) * 1.6 * storm * k;
    const jy = Math.cos(t * 1.3) * 1.2 * storm * k;
    const glow = Math.max(storm * 0.6, final);
    card.style.opacity = String(c.o);
    card.style.transform = `translate(${jx}px, ${c.y * k + jy}px) scale(${c.sx * sc}, ${c.sy * sc})`;
    card.style.filter = `brightness(${Math.max(c.br, 1 + 0.4 * pop + 0.5 * storm + 0.9 * final).toFixed(3)})`;
    card.style.boxShadow =
      glow > 0 ? `0 0 ${(8 + 30 * glow) * k}px rgba(140,255,63,${0.3 + 0.6 * glow})` : "none";

    // 貼られた広さに合わせて場がライムに染まる。着地と最後の輪・光
    g.globalCompositeOperation = "lighter";
    const wash = (pasted / pieces.length) * (1 - out);
    if (wash > 0) {
      g.fillStyle = `rgba(140,255,63,${0.12 * wash})`;
      g.fillRect(0, 0, f.width, f.height);
    }
    ring(t >= IMPACT ? seg(t, IMPACT, IMPACT + 600) : -1);
    if (t >= LAST) {
      ring(seg(t, LAST, LAST + 550));
      const gr = g.createRadialGradient(CX - f.left, CY - f.top, 0, CX - f.left, CY - f.top, 140 * sw);
      gr.addColorStop(0, `rgba(140,255,63,${0.5 * final})`);
      gr.addColorStop(1, "rgba(140,255,63,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, f.width, f.height);
    }
    g.globalCompositeOperation = "source-over";

    // 揺れ（着地と、最後の 1 枚）
    const shakeT = shakeOf(t, IMPACT, 4, 180) + shakeOf(t, LAST, 7, 220);
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
