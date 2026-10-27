import { gsap } from "gsap";

/**
 * 決着：負けた側のプレイヤーの帯（ライフのゲージ）が砕け、破片が画面のこちらへ飛んできて、それをきっかけに結果へ切り替わる。
 * オーナー：「体力が0以下になったら、プレイヤーの体力ゲージが壊れるか破壊されるかして、はっきり負けた、勝ったを認識させた上で
 * その破壊された破片が画面のこちらまで飛んできて、その破片を暗転とか切り替えのきっかけにして勝ち負けのリザルト画面を表示する」。
 * モックへの直し（10月27日）：「破壊された瞬間がスローモーションになればいい」「飛んでくる時は周りがボケてる感じで、
 * その破片だけがゆっくりから普通の速度になりつつこっちに向かってきて、ぶつかる！となって暗転か白転」「文字無しの破片でいい」
 * 「勝ちの時には、相手の破片がこっちにくる時に、キラッと光ってほしい」「負けの時には破片が黒かったり全体的にああ、負けたんだな、、、
 * という雰囲気感、色合い」「破片が、できれば飛んでくる時にぐるっとそれ自体が回転してくるといい」。
 * モック「決着の演出」（claude.ai の Artifact）は、このファイルをそのまま組み込んで動かしている（動きと秒数は同じ）。
 *
 * 時間割（0 は始まり。始まるのは、最後の一撃の数字とライフ 0 を見せ終えてから。Play.tsx が待つ）：
 * 1. ひび 0〜0.56 秒：ライフのゲージから、帯にひび（割れ目から地の青がぼやけて透ける）が 3 段（0・0.17・0.34 秒）で広がる。そのたびに帯が小さく揺れて光る
 * 2. 砕ける 0.56 秒：帯が、ひびの形の文字のないガラスの破片になってはじける（帯の元の姿は隠す）。0.05 秒だけふつうの速さ。
 *    勝ち（相手の帯）は白いガラスに相手のゲージの色、負け（自分の帯）は黒いガラス
 * 3. スローモーション 0.61〜1.26 秒：時間がふつうの 7% の速さに落ちる（0.09 秒かけて）。ほかの破片はほとんど止まって漂い、
 *    まわりが 0.42 秒かけてボケる（勝ちは少し暗く、負けは色を失って暗く沈み、四隅から暗くなる）。
 *    こちらへ来る破片 1 枚だけがくっきりしたまま、まわりより速い 22% の速さでゆっくり近づき始める。勝ちはその角が 1 回キラッと光る
 * 4. 飛んでくる 1.26〜1.81 秒：時間が 0.46 秒かけてふつうの速さに戻り、その破片が 1 回くるっと裏返りながら（縦の軸で半回転）
 *    一気に近づき、正面を向いて画面いっぱいになる（オーナー：「回転も輝きも一回でいい」）
 * 5. ぶつかる 1.81 秒：破片が揺れ、end で切り替える（省略すると、勝ちは白転・負けは暗転）
 *    - dark（暗転）：画面全体が一瞬光ってから 0.08 秒で黒くなる → 0.26 秒そのまま → 結果を出して 0.52 秒で明ける
 *    - white（白転）：白く光り、そのまま白い結果の画面へ明ける
 *
 * 破片の動きは「演出の中の時間」で決め、実際の時間との対応（スローモーションの速さの変わり方）を 1 か所で決める。
 * 帯の揺れは CSS の個別のプロパティ（translate）で付け、ほかの演出の transform とぶつからないようにする。
 * 全部を 1 本の GSAP の時間割に載せる（開発中に GSAP の時計を遅くしても、間合いがずれないように）
 */

type Rect = { left: number; top: number; width: number; height: number };
type P = { x: number; y: number };

export type LifeBreakEnd = "dark" | "white";

export interface LifeBreakOptions {
  /** 演出を置く層（画面座標。#fx-layer） */
  layer: HTMLElement;
  /** 画面の枠（画面座標） */
  frame: Rect;
  /** 砕けた瞬間に揺らす盤面 */
  board?: HTMLElement | null;
  /** ひびの出どころ（ライフのゲージ）。無ければ帯の真ん中 */
  gauge?: HTMLElement | null;
  /** 破片の色味（負けた側のゲージの色） */
  tint?: string;
  /**
   * 砕けるのが見ている人の帯か（負け）。負けは破片が黒く、まわりが色を失って暗く沈む。
   * 勝ち（相手の帯）は、こちらへ来る破片がキラッと光る
   */
  mine?: boolean;
  /** 切り替え方。省略すると、勝ちは白転・負けは暗転 */
  end?: LifeBreakEnd;
  /** ひびの色（地の青）に混ぜる白の量（0〜1。モックで見比べる。省略で CRACK_WHITE） */
  crackWhite?: number;
  /** 画面が覆われて、結果を出してよいとき（このあと明けて結果が見える） */
  onCovered?: () => void;
  /** 乱数（モックで同じ形を出し直すため）。省略で Math.random */
  random?: () => number;
}

export interface LifeBreak {
  /** 最後まで見せ終えたら resolve（cancel でも resolve） */
  done: Promise<void>;
  /** やめる・片付ける：置いた要素を消し、帯と盤面を元に戻す（見せ終えたあとに呼んでもよい） */
  cancel: () => void;
  /** 時間割の全体（モックの再生の速さを変えるため） */
  timeline: gsap.core.Timeline;
}

// 秒数（ミリ秒。実際の時間）
const CRACKS = [0, 170, 340]; // ひびが広がる 3 段
const GROW = 110; // ひび 1 本が伸びきるまで
const BREAK = 560; // 砕ける
const BURST = 50; // 砕けた直後、ふつうの速さではじける
const SLOW_IN = 90; // スローモーションに落ちるまで
const SLOW = 0.07; // スローモーションの速さ（ふつうの 7%）
const SLOW_HERO = 0.22; // こちらへ来る破片だけは、止まったまわりの中をゆっくり近づく（ふつうの 22%）
const APPROACH = BREAK + 700; // 時間が戻り始め、破片が速くなっていく
const RAMP = 460; // ゆっくりからふつうの速さに戻るまで
const HIT = APPROACH + RAMP + 90; // 破片がぶつかる
const FOCUS = 420; // まわりがボケきるまで（スローモーションに入ってから）
const KNOCK = 90; // ぶつかって揺れる
const COVER = 80; // 暗転しきるまで
const HOLD = 260; // 暗いまま
const REVEAL = 520; // 明けて結果が見える
const FLASH = 120; // 白転：白くなりきるまで

const RAYS = 9; // ひびの放射の数
const BOARD_BLUE = "#2c7ab8"; // 盤面の地の青（app.css の .play-full）
const CRACK_SEE = 0.45; // 割れ目から地の青が透ける濃さ
const CRACK_WHITE = 0.5; // ひびの色（地の青）に混ぜる白の量
const BLUR = 6; // まわりのボケ（px）
const DIM = 0.72; // まわりの明るさ

const s = (ms: number) => ms / 1000;
/** #rrggbb に白を t の割合で混ぜる */
const whiten = (hex: string, t: number) =>
  `#${[1, 3, 5]
    .map((i) => {
      const x = Number.parseInt(hex.slice(i, i + 2), 16);
      return Math.round(x + (255 - x) * t)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
/** 0〜1 の濃さを、色に付ける 2 桁の 16 進に */
const alpha = (a: number) =>
  Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 実際の時間（ミリ秒）での演出の速さ。砕けた直後はふつう → スローモーション（slow）→ ふつうに戻る */
function speedAt(t: number, slow: number): number {
  if (t < BREAK + BURST) return 1;
  if (t < BREAK + BURST + SLOW_IN) return 1 + (slow - 1) * (1 - (1 - (t - BREAK - BURST) / SLOW_IN) ** 2);
  if (t < APPROACH) return slow;
  if (t < APPROACH + RAMP) return slow + (1 - slow) * ((t - APPROACH) / RAMP) ** 2;
  return 1;
}
/** 砕けてからの演出の中の時間（ミリ秒）。実際の時間を 1 ミリ秒ずつ足して、先に表にしておく */
function sceneTable(slow: number) {
  const out = new Float32Array(HIT - BREAK + 600);
  for (let i = 1; i < out.length; i++) out[i] = (out[i - 1] ?? 0) + speedAt(BREAK + i - 0.5, slow);
  return (t: number) => out[Math.max(0, Math.min(out.length - 1, Math.round(t - BREAK)))] ?? 0;
}
/** まわり（ほかの破片・閃光）の時間 */
const sceneAt = sceneTable(SLOW);
/** こちらへ来る破片の時間 */
const heroAt = sceneTable(SLOW_HERO);

/** 多角形を、四角（0〜w, 0〜h）で切り取る（Sutherland–Hodgman） */
function clipToRect(poly: P[], w: number, h: number): P[] {
  const cut = (pts: P[], inside: (p: P) => boolean, at: (a: P, b: P) => P) => {
    const out: P[] = [];
    pts.forEach((cur, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length] as P;
      if (inside(cur)) {
        if (!inside(prev)) out.push(at(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(at(prev, cur));
    });
    return out;
  };
  const onX = (x: number) => (a: P, b: P) => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  const onY = (y: number) => (a: P, b: P) => ({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y });
  let pts = poly;
  pts = cut(pts, (p) => p.x >= 0, onX(0));
  pts = cut(pts, (p) => p.x <= w, onX(w));
  pts = cut(pts, (p) => p.y >= 0, onY(0));
  pts = cut(pts, (p) => p.y <= h, onY(h));
  return pts;
}

/** 多角形の面積と重心 */
function areaOf(pts: P[]): { area: number; c: P } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length] as P;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  });
  if (Math.abs(a) < 1e-6) return { area: 0, c: pts[0] ?? { x: 0, y: 0 } };
  return { area: Math.abs(a / 2), c: { x: cx / (3 * a), y: cy / (3 * a) } };
}

const NS = "http://www.w3.org/2000/svg";
function svg(w: number, h: number): SVGSVGElement {
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  el.style.position = "absolute";
  el.style.left = "0";
  el.style.top = "0";
  el.style.overflow = "hidden";
  return el;
}

/** ひび 1 本（太い線から順に重ねる。[色, 太さ]）。破線の長さで、伸びる動きを付ける */
function crackLine(parent: SVGElement, a: P, b: P, layers: [string, number][]): SVGLineElement[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return layers.map(([color, w]) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", String(a.x));
    l.setAttribute("y1", String(a.y));
    l.setAttribute("x2", String(b.x));
    l.setAttribute("y2", String(b.y));
    l.setAttribute("stroke", String(color));
    l.setAttribute("stroke-width", String(w));
    l.setAttribute("stroke-linecap", "round");
    l.style.strokeDasharray = `${len}`;
    l.style.strokeDashoffset = `${len}`;
    parent.appendChild(l);
    return l;
  });
}

const box = (r: Rect, extra: Partial<CSSStyleDeclaration> = {}) => {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    pointerEvents: "none",
    ...extra,
  });
  return el;
};

/** 揺れ（だんだん弱まる）。el の translate を動かす */
function jolt(
  tl: gsap.core.Timeline,
  els: HTMLElement[],
  at: number,
  power: number,
  ms: number,
  rnd: () => number,
) {
  const p = { k: 0 };
  tl.to(
    p,
    {
      k: 1,
      duration: s(ms),
      ease: "none",
      onUpdate: () => {
        const left = 1 - p.k;
        const x = (rnd() - 0.5) * 2 * power * left;
        const y = (rnd() - 0.5) * 2 * power * left * 0.6;
        for (const el of els) el.style.translate = p.k >= 1 ? "" : `${x}px ${y}px`;
      },
    },
    s(at),
  );
}

let glassId = 0;

export function lifeBreak(bar: HTMLElement, opts: LifeBreakOptions): LifeBreak {
  const rnd = opts.random ?? Math.random;
  const mine = !!opts.mine;
  const end = opts.end ?? (mine ? "dark" : "white");
  const { layer, frame } = opts;
  const r = bar.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  const scale = bar.offsetWidth > 0 ? w / bar.offsetWidth : 1;
  const placed: Element[] = [];
  const place = <T extends Element>(el: T) => {
    layer.appendChild(el);
    placed.push(el);
    return el;
  };

  /** 負けた側のゲージの色（ひびと破片の色味） */
  const tint = opts.tint ?? "#bfe6fa";
  // ひびの出どころ：ライフのゲージの左寄り（減りきった所）
  const g = opts.gauge?.getBoundingClientRect();
  const o: P = g
    ? { x: g.left - r.left + g.width * 0.3, y: g.top - r.top + g.height / 2 }
    : { x: w / 2, y: h / 2 };

  // ひびの網：出どころから放射に RAYS 本、輪で区切る。網の目がそのまま破片になる
  const step = (Math.PI * 2) / RAYS;
  const base = rnd() * step;
  const far = Math.hypot(Math.max(o.x, w - o.x), Math.max(o.y, h - o.y)) * 1.15;
  const rings = [h * 0.34, h * 0.8, h * 1.6, h * 2.9, far].filter((v, i, a) => i === a.length - 1 || v < far);
  const angles = Array.from({ length: RAYS }, (_, i) => base + i * step + (rnd() - 0.5) * step * 0.45);
  const vtx = angles.map((a) =>
    rings.map((rr, j) => {
      const k = j === rings.length - 1 ? 1.1 : 1 + (rnd() - 0.5) * 0.32;
      const t = a + (rnd() - 0.5) * step * 0.16;
      return { x: o.x + Math.cos(t) * rr * k, y: o.y + Math.sin(t) * rr * k };
    }),
  );
  /** ひびが出る段（内側の輪ほど早い） */
  const stageOf = (j: number) => (j <= 1 ? 0 : j === 2 ? 1 : 2);

  const tl = gsap.timeline({ paused: true });

  // ---------- 1. ひび ----------
  const crackBox = place(box(r));
  const crackSvg = svg(w, h);
  crackBox.appendChild(crackSvg);
  // 帯と同じ角の丸みで切る（ひびが帯の外にはみ出さない）
  crackBox.style.borderRadius = `${(Number.parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 0) * scale}px`;
  crackBox.style.overflow = "hidden";
  // ひびは、割れ目から盤面の地の青がぼやけて透ける形（オーナー：「ガラスにヒビが入る時に、そのヒビの部分に色がつくのが違和感」
  // →「薄い灰色が一番近い」→「背景色をそのまま使用して、ガラス系の加工をしたぼやかした感じに。割れ目の部分ってガラスが薄く
  // なっているから他に比べてすりガラスの白成分が薄いみたいなイメージ」）。
  // 地の青を、淡く広くぼかした線と、少し濃く細くぼかした線の 2 枚で重ねる（白い帯が、割れ目だけ薄くなって青が透けて見える）
  const fid = `lb-crack-${++glassId}`;
  const blur = (id: string, sd: number) =>
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  crackSvg.innerHTML = `<defs>${blur(`${fid}-soft`, 1.3)}${blur(`${fid}-core`, 0.45)}</defs><g filter="url(#${fid}-soft)"></g><g filter="url(#${fid}-core)"></g>`;
  const [soft, core] = [...crackSvg.querySelectorAll("g")] as SVGGElement[];
  // 「もっと色薄くていいな、つまり白をもう少し混ぜて」→ 地の青に白を混ぜる
  const blue = whiten(BOARD_BLUE, opts.crackWhite ?? CRACK_WHITE);
  const crack = (a: P, b: P, width: number, k: number) => [
    ...crackLine(soft as SVGGElement, a, b, [[`${blue}${alpha(CRACK_SEE * 0.55 * k)}`, width * 2.6]]),
    ...crackLine(core as SVGGElement, a, b, [[`${blue}${alpha(CRACK_SEE * k)}`, width * 1.0]]),
  ];
  const segs: { lines: SVGLineElement[]; stage: number; delay: number }[] = [];
  vtx.forEach((ray, i) => {
    const next = vtx[(i + 1) % RAYS] as P[];
    ray.forEach((v, j) => {
      const from = j === 0 ? o : (ray[j - 1] as P);
      // 放射のひびは、出どころに近いほど太い。輪のひびは内側だけ、ところどころ（クモの巣に見えすぎないように）
      segs.push({ lines: crack(from, v, Math.max(1.4, 2.8 - j * 0.45), 1), stage: stageOf(j), delay: 0 });
      if (j < 3 && rnd() < 0.7)
        segs.push({ lines: crack(v, next[j] as P, 1.3, 0.85), stage: stageOf(j), delay: 60 });
    });
  });
  for (const sg of segs)
    tl.to(
      sg.lines,
      { strokeDashoffset: 0, duration: s(GROW), ease: "power2.out" },
      s((CRACKS[sg.stage] ?? 0) + sg.delay),
    );
  // ひびが入るたびに、帯が小さく揺れて光る
  CRACKS.forEach((at, i) => {
    jolt(tl, [bar, crackBox], at, 2 + i * 1.2, 130, rnd);
    tl.fromTo(
      bar,
      { filter: "brightness(1.35)" },
      { filter: "brightness(1)", duration: s(150), ease: "power1.out", immediateRender: false },
      s(at),
    );
  });
  // ひびの出どころの小さな光
  const spark = place(
    box(
      { left: r.left + o.x - 22, top: r.top + o.y - 22, width: 44, height: 44 },
      {
        borderRadius: "50%",
        background: "radial-gradient(circle, #ffffff 0%, #bfe9ff99 35%, transparent 70%)",
      },
    ),
  );
  tl.fromTo(
    spark,
    { scale: 0.2, opacity: 1 },
    { scale: 1.3, opacity: 0, duration: s(240), ease: "power2.out" },
    0,
  );

  // ---------- 2. 砕ける ----------
  // 破片：ひびの網の目の形の、文字のないガラス。
  // 勝ち：地は帯の色、角に相手のゲージの色をうっすら差し、ふちを白く光らせる。負け：黒いガラス、ふちは鈍い灰色
  const glass = mine
    ? { a: "#3a4352", b: "#141a24", c: "#05080d", edge: "#7d8899", edgeOp: 0.75, shine: 0.3 }
    : {
        a: "#ffffff",
        b: getComputedStyle(bar).backgroundColor || "#ffffff",
        c: tint,
        edge: "#ffffff",
        edgeOp: 1,
        shine: 0.9,
      };
  // まわりをボケさせる幕：盤面の上・破片の下に置き、うしろ（盤面の地・カード・演出の舞台）をまとめてボケさせる。
  // 負けは色を抜いて暗く沈め、四隅から暗くする。幕の濃さ（opacity）だけを動かす（ボケの強さを毎回書き換えるより軽い）
  // 幕は演出の層の中ではなく、層のすぐ下に置く（広い画面では層を枠の形で切り抜いていて、切り抜いた層の中からはうしろをボケさせられないため）
  const veil = box(frame, {
    opacity: "0",
    zIndex: String((Number.parseInt(getComputedStyle(layer).zIndex, 10) || 1) - 1),
    background: mine
      ? "radial-gradient(120% 90% at 50% 46%, transparent 28%, #04070ce6 100%)"
      : "transparent",
  });
  (layer.parentElement ?? document.body).appendChild(veil);
  placed.push(veil);
  const veilFilter = mine
    ? `blur(${BLUR}px) grayscale(0.9) brightness(0.5)`
    : `blur(${BLUR}px) brightness(${DIM}) saturate(1.2)`;
  veil.style.setProperty("backdrop-filter", veilFilter);
  veil.style.setProperty("-webkit-backdrop-filter", veilFilter);
  type Shard = {
    el: HTMLElement;
    shade: SVGPolygonElement;
    shine: SVGLinearGradientElement;
    c: P;
    /** 重心からいちばん遠い角（重心から見た位置。キラッと光らせる所） */
    tip: P;
    area: number;
    bw: number;
    bh: number;
  };
  const shards: Shard[] = [];
  vtx.forEach((ray, i) => {
    const next = vtx[(i + 1) % RAYS] as P[];
    ray.forEach((v, j) => {
      const poly = j === 0 ? [o, v, next[0] as P] : [ray[j - 1] as P, v, next[j] as P, next[j - 1] as P];
      const pts = clipToRect(poly, w, h);
      if (pts.length < 3) return;
      const { area, c } = areaOf(pts);
      if (area < 24) return;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const bw = Math.max(...xs) - minX;
      const bh = Math.max(...ys) - minY;
      const el = box(
        { left: r.left + minX, top: r.top + minY, width: bw, height: bh },
        { visibility: "hidden", transformOrigin: `${c.x - minX}px ${c.y - minY}px` },
      );
      const sv = svg(bw, bh);
      sv.style.overflow = "visible";
      const id = `lb-glass-${++glassId}`;
      const local = pts.map((p) => `${(p.x - minX).toFixed(1)},${(p.y - minY).toFixed(1)}`).join(" ");
      sv.innerHTML =
        `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${glass.a}" stop-opacity="0.97"/>` +
        `<stop offset="0.55" stop-color="${glass.b}" stop-opacity="0.93"/>` +
        `<stop offset="1" stop-color="${glass.c}" stop-opacity="0.92"/></linearGradient>` +
        `<linearGradient id="${id}-s" x1="-1" y1="0" x2="-0.4" y2="0.3"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/>` +
        `<stop offset="0.5" stop-color="#ffffff" stop-opacity="${glass.shine}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
        // ふちの線は、大きくしても太らない（画面いっぱいにしたとき、白い太い帯にならないように）
        `<polygon points="${local}" fill="url(#${id})" stroke="${glass.edge}" stroke-opacity="${glass.edgeOp}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
        `<polygon points="${local}" fill="url(#${id}-s)"/>` +
        `<polygon points="${local}" fill="${end === "white" ? "#ffffff" : "#03060c"}" opacity="0"/>`;
      el.appendChild(sv);
      const far = pts.reduce((a, b) =>
        Math.hypot(b.x - c.x, b.y - c.y) > Math.hypot(a.x - c.x, a.y - c.y) ? b : a,
      );
      shards.push({
        el: place(el),
        shade: sv.lastElementChild as SVGPolygonElement,
        shine: sv.querySelector(`#${id}-s`) as SVGLinearGradientElement,
        c,
        tip: { x: far.x - c.x, y: far.y - c.y },
        area,
        bw,
        bh,
      });
    });
  });
  // こちらへ飛んでくる 1 枚：ある程度大きい破片のうち、出どころにいちばん近いもの（無ければいちばん大きいもの）
  const near = (sh: Shard) => Math.hypot(sh.c.x - o.x, sh.c.y - o.y);
  const hero =
    [...shards].filter((sh) => sh.area > (w * h) / 28).sort((a, b) => near(a) - near(b))[0] ??
    [...shards].sort((a, b) => b.area - a.area)[0];
  const rest = shards.filter((sh) => sh !== hero);

  const flash = place(
    box(
      { left: r.left + o.x - 90, top: r.top + o.y - 90, width: 180, height: 180 },
      {
        borderRadius: "50%",
        background: mine
          ? "radial-gradient(circle, #c9d1dc 0%, #8a96a888 30%, transparent 70%)"
          : "radial-gradient(circle, #ffffff 0%, #d6f2ffcc 28%, #7fd0ff44 52%, transparent 72%)",
        opacity: "0",
      },
    ),
  );
  tl.call(
    () => {
      bar.style.visibility = "hidden";
      crackBox.style.visibility = "hidden";
      for (const sh of shards) sh.el.style.visibility = "visible";
    },
    [],
    s(BREAK),
  );
  if (opts.board) jolt(tl, [opts.board], BREAK, 5, BURST + 20, rnd);

  // ほかの破片：外へ強くはじけ、回りながら落ちる（演出の中の時間で動くので、スローモーションの間はほとんど止まって漂う）
  const motion = rest.map((sh) => {
    const dx = sh.c.x - o.x;
    const dy = sh.c.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const v = 700 + rnd() * 600;
    return {
      sh,
      vx: (dx / d) * v,
      vy: (dy / d) * v * 0.6 - (200 + rnd() * 250),
      spin: (rnd() - 0.5) * 900,
      rx: (rnd() - 0.5) * 700,
      ry: (rnd() - 0.5) * 700,
      grow: 1 + rnd() * 2,
    };
  });
  // こちらへ来る破片：まっすぐこちらへ一定の速さで来る（演出の中の時間で）。遠近で、近づくほど一気に大きくなる。
  // 画面の真ん中を目指して寄りながら回り、最後は正面を向いて画面いっぱいになる
  const fc: P = { x: frame.left + frame.width / 2, y: frame.top + frame.height * 0.46 };
  const start: P = hero ? { x: r.left + hero.c.x, y: r.top + hero.c.y } : fc;
  const big = hero
    ? Math.max(frame.width / Math.max(8, hero.bw), frame.height / Math.max(8, hero.bh)) * 2.4
    : 1;
  // 飛んでくる間に、破片そのものが縦の軸で 1 回くるっと裏返り、ぶつかる瞬間に正面を向く（ゆっくり回り始め、時間が戻ると速く回る）。
  // ガラスは表と裏が同じ見た目なので、半回転で「1 回の回転」に見える（1 回転させると、裏返るのが 2 回に見えた）。
  // 画面の上での回りは、ごく小さく
  const turn = (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 15);
  const flip = rnd() < 0.5 ? -180 : 180;
  const total = heroAt(HIT);
  // 勝ち：こちらへ来る破片の角が、近づき始めたときに 1 回キラッと光る
  const glints = mine || !hero ? [] : [{ at: BREAK + BURST + 200, dur: 320, size: 1.25 }];
  const twinkle = glints.length
    ? place(box({ left: 0, top: 0, width: 72, height: 72 }, { opacity: "0" }))
    : null;
  if (twinkle)
    twinkle.innerHTML =
      '<svg viewBox="-36 -36 72 72" width="72" height="72" style="overflow:visible">' +
      '<defs><radialGradient id="lb-twinkle"><stop offset="0" stop-color="#ffffff"/><stop offset="0.3" stop-color="#ffffff" stop-opacity="0.75"/>' +
      '<stop offset="1" stop-color="#bfe9ff" stop-opacity="0"/></radialGradient></defs>' +
      '<circle r="16" fill="url(#lb-twinkle)"/>' +
      '<path d="M0,-36 L3,-3 L36,0 L3,3 L0,36 L-3,3 L-36,0 L-3,-3 Z" fill="#ffffff"/>' +
      '<path d="M0,-15 L1.6,-1.6 L15,0 L1.6,1.6 L0,15 L-1.6,1.6 L-15,0 L-1.6,-1.6 Z" fill="#ffffff" transform="rotate(45)"/></svg>';
  const drive = { t: 0 };
  tl.to(
    drive,
    {
      t: s(HIT + KNOCK - BREAK),
      duration: s(HIT + KNOCK - BREAK),
      ease: "none",
      onUpdate: () => {
        const real = BREAK + drive.t * 1000;
        const te = sceneAt(real) / 1000;
        // まわりがボケて暗くなる（スローモーションに入ってから）
        const focus = clamp01((real - BREAK - BURST) / FOCUS);
        const fe = 1 - (1 - focus) ** 2;
        veil.style.opacity = String(fe);
        // 白い閃光：演出の中の時間で消える（スローモーションの間は、うっすら残る）
        const ft = te * 1000;
        gsap.set(flash, {
          scale: 0.3 + 1.5 * (1 - Math.exp(-ft / 40)),
          opacity: (mine ? 0.6 : 1) * Math.exp(-ft / 45),
        });
        const fade = clamp01((real - APPROACH - 150) / (HIT - APPROACH - 150));
        for (const m of motion)
          gsap.set(m.sh.el, {
            x: m.vx * te,
            y: m.vy * te + 0.5 * 2400 * te * te,
            rotation: m.spin * te,
            rotationX: m.rx * te,
            rotationY: m.ry * te,
            scale: 1 + m.grow * te,
            opacity: (1 - 0.3 * fe) * (1 - fade),
            filter: `blur(${(5 * fe).toFixed(2)}px)`,
            transformPerspective: 700,
          });
        if (!hero) return;
        const p = clamp01(heroAt(Math.min(real, HIT)) / total);
        const z = 1 / (1 - p * (1 - 1 / big));
        const lat = 1 - (1 - p) ** 2;
        const mix = 0.6 * lat + 0.4 * ((z - 1) / (big - 1 || 1));
        // ぶつかった瞬間に揺れる
        const knock = real > HIT ? 1 - (real - HIT) / KNOCK : 0;
        const hx = (fc.x - start.x) * mix + (rnd() - 0.5) * 20 * knock;
        const hy = (fc.y - start.y) * mix + (rnd() - 0.5) * 20 * knock;
        const spinY = flip * p;
        const spinX = 14 * Math.sin(p * Math.PI);
        const spinZ = turn * lat;
        gsap.set(hero.el, {
          x: hx,
          y: hy,
          scale: z,
          rotation: spinZ,
          rotationX: spinX,
          rotationY: spinY,
          transformPerspective: 900,
          // ボケたまわりから浮かび上がるように、ふちをうっすら光らせる（近づいてからは外す。大きいほど重いので）
          filter:
            p < 0.8 ? `drop-shadow(0 0 ${(7 / z).toFixed(2)}px ${mine ? "#8a96a880" : "#ffffffcc"})` : "none",
        });
        if (twinkle) {
          // 光る角の画面の位置（回転をざっと当てはめる。奥行きの歪みは無視）
          const rad = (d: number) => (d * Math.PI) / 180;
          const lx = hero.tip.x * z * Math.cos(rad(spinY));
          const ly = hero.tip.y * z * Math.cos(rad(spinX));
          const cz = Math.cos(rad(spinZ));
          const sz = Math.sin(rad(spinZ));
          const g = glints.find((gl) => real >= gl.at && real < gl.at + gl.dur);
          const k = g ? (real - g.at) / g.dur : 0;
          const peak = g ? Math.sin(Math.PI * k) : 0;
          gsap.set(twinkle, {
            x: start.x + hx + lx * cz - ly * sz - 36,
            y: start.y + hy + lx * sz + ly * cz - 36,
            scale: (g?.size ?? 1) * (0.15 + 1.1 * peak),
            rotation: 90 * k,
            opacity: peak,
          });
        }
        // スローモーションの間に、破片の面を光がすっと走る（この 1 枚に目を向けさせる）
        const g = -1 + 2.6 * clamp01((real - BREAK - BURST - 120) / (APPROACH - BREAK - BURST - 40));
        hero.shine.setAttribute("x1", g.toFixed(3));
        hero.shine.setAttribute("x2", (g + 0.6).toFixed(3));
        // 暗転：近づききる前に影になっていく／白転：白く光っていく
        hero.shade.setAttribute(
          "opacity",
          String((end === "white" ? 0.8 : 0.5) * clamp01((p - 0.82) / 0.18)),
        );
      },
    },
    s(BREAK),
  );

  // ---------- 3. ぶつかって切り替える ----------
  const cover = place(
    box(frame, { background: end === "white" ? "#ffffff" : "#03060c", opacity: "0", visibility: "hidden" }),
  );
  // 覆い終えた破片は、隠すのではなく外す（画面より大きく拡大した破片は、隠しても絵が残ることがあった）
  const hideShards = () => {
    for (const sh of shards) sh.el.remove();
  };
  let covered = 0;
  if (end === "dark") {
    // ぶつかった瞬間、画面全体が一瞬白く光ってから黒くなる
    const spark = place(box(frame, { background: mine ? "#c9d1dc" : "#ffffff", opacity: "0" }));
    tl.fromTo(
      spark,
      { opacity: mine ? 0.35 : 0.75 },
      { opacity: 0, duration: s(110), ease: "power1.out", immediateRender: false },
      s(HIT),
    );
    tl.set(cover, { visibility: "visible" }, s(HIT));
    tl.to(cover, { opacity: 1, duration: s(COVER), ease: "power1.in" }, s(HIT + 30));
    tl.call(hideShards, [], s(HIT + 30 + COVER));
    covered = HIT + 30 + COVER + HOLD;
  } else {
    tl.set(cover, { visibility: "visible" }, s(HIT - 20));
    tl.to(cover, { opacity: 1, duration: s(FLASH), ease: "power2.in" }, s(HIT - 20));
    tl.call(hideShards, [], s(HIT - 20 + FLASH));
    covered = HIT - 20 + FLASH + HOLD * 0.8;
  }
  // 覆われたら、まわりをボケさせる幕など、覆いの下に残ったものを外してから結果を出す（明ける間に結果までボケないように）
  tl.call(
    () => {
      for (const el of placed) if (el !== cover) el.remove();
      opts.onCovered?.();
    },
    [],
    s(covered),
  );
  tl.to(cover, { opacity: 0, duration: s(REVEAL), ease: "power2.out" }, s(covered));

  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  tl.eventCallback("onComplete", () => {
    for (const el of placed) el.remove();
    finish();
  });
  tl.play(0);

  const cancel = () => {
    tl.kill();
    for (const el of placed) el.remove();
    bar.style.visibility = "";
    bar.style.translate = "";
    bar.style.filter = "";
    if (opts.board) opts.board.style.translate = "";
    finish();
  };
  return { done, cancel, timeline: tl };
}

/**
 * 決着のきっかけを見せる（砕ける前に。見せ終えたら resolve）。
 * - deckOut：山札が切れた人の空の山札が、赤く光って揺れる
 * - specialWin：特殊勝利のカードが、金に光って脈打つ
 */
export function endCue(el: HTMLElement | null, kind: "deckOut" | "specialWin"): Promise<void> {
  if (!el) return Promise.resolve();
  const tl = gsap.timeline();
  if (kind === "deckOut") {
    const p = { k: 0 };
    tl.to(p, {
      k: 1,
      duration: 0.5,
      ease: "none",
      onUpdate: () => {
        const left = 1 - p.k;
        el.style.translate = p.k >= 1 ? "" : `${Math.sin(p.k * Math.PI * 9) * 5 * left}px 0px`;
        const glow = Math.sin(p.k * Math.PI);
        el.style.filter =
          p.k >= 1 ? "" : `drop-shadow(0 0 ${14 * glow}px #ff3b4c) brightness(${1 + 0.35 * glow})`;
      },
    });
    tl.to({}, { duration: 0.15 });
  } else {
    const p = { k: 0 };
    tl.to(p, {
      k: 1,
      duration: 0.7,
      ease: "none",
      onUpdate: () => {
        const glow = Math.sin(p.k * Math.PI);
        el.style.scale = p.k >= 1 ? "" : String(1 + 0.08 * glow);
        el.style.filter =
          p.k >= 1 ? "" : `drop-shadow(0 0 ${20 * glow}px #ffd76a) brightness(${1 + 0.4 * glow})`;
      },
    });
    tl.to({}, { duration: 0.12 });
  }
  return new Promise((resolve) => {
    tl.eventCallback("onComplete", () => resolve());
  });
}
