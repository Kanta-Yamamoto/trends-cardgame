import { gsap } from "gsap";

/**
 * 決着：負けた側のプレイヤーの帯（ライフのゲージ）が砕け、破片が画面のこちらへ飛んできて、それをきっかけに結果へ切り替わる。
 * オーナー：「体力が0以下になったら、プレイヤーの体力ゲージが壊れるか破壊されるかして、はっきり負けた、勝ったを認識させた上で
 * その破壊された破片が画面のこちらまで飛んできて、その破片を暗転とか切り替えのきっかけにして勝ち負けのリザルト画面を表示する」。
 * モック「決着の演出」（claude.ai の Artifact）は、このファイルをそのまま組み込んで動かしている（動きと秒数は同じ）。
 *
 * 時間割（0 は始まり。始まるのは、最後の一撃の数字とライフ 0 を見せ終えてから。Play.tsx が待つ）：
 * 1. ひび 0〜0.56 秒：ライフのゲージから、帯にひびが 3 段（0・0.17・0.34 秒）で広がる。そのたびに帯が小さく揺れて光る
 * 2. 砕ける 0.56 秒：帯が、ひびで分かれた破片になってはじける（帯の元の姿は隠す）。白い閃光と盤面の揺れ。0.07 秒止める
 * 3. 飛んでくる 0.63〜1.27 秒：大きめの破片 3 つが回りながら画面のこちらへ近づく（2 つは画面の外へ抜け、最後の 1 つが真ん中へ）。
 *    ほかの破片は散って落ちる
 * 4. 切り替え 1.27 秒〜（end で変える）
 *    - dark（暗転）：最後の破片が画面いっぱいになった瞬間に黒くなる（0.09 秒）→ 0.26 秒そのまま → 結果を出して 0.52 秒で明ける
 *    - white（白く抜ける）：破片が画面いっぱいになるところで白く光り、そのまま結果へ明ける
 *    - crack（画面にひび）：破片が画面に当たって止まり、当たった所から画面全体にひびが走る → 暗くなって暗転 → 結果
 *
 * 破片は、帯をそのまま写したもの（計算済みのスタイルごと写すので、どこに置いても同じ姿）を、ひびの形で切り抜いて動かす。
 * 帯の揺れは CSS の個別のプロパティ（translate）で付け、ほかの演出の transform とぶつからないようにする。
 * 全部を 1 本の GSAP の時間割に載せる（開発中に GSAP の時計を遅くしても、間合いがずれないように）
 */

type Rect = { left: number; top: number; width: number; height: number };
type P = { x: number; y: number };

export type LifeBreakEnd = "dark" | "white" | "crack";

export interface LifeBreakOptions {
  /** 演出を置く層（画面座標。#fx-layer） */
  layer: HTMLElement;
  /** 画面の枠（画面座標） */
  frame: Rect;
  /** 砕けたときに揺らす盤面 */
  board?: HTMLElement | null;
  /** ひびの出どころ（ライフのゲージ）。無ければ帯の真ん中 */
  gauge?: HTMLElement | null;
  /** 切り替え方（ゲームは dark） */
  end?: LifeBreakEnd;
  /** 画面が覆われて、結果を出してよいとき（このあと明けて結果が見える） */
  onCovered?: () => void;
  /** 乱数（モックで同じ形を出し直すため）。省略で Math.random */
  random?: () => number;
}

export interface LifeBreak {
  /** 最後まで見せ終えたら resolve（cancel でも resolve） */
  done: Promise<void>;
  /** やめる・片付ける：置いた要素を消し、帯を元に戻す（見せ終えたあとに呼んでもよい） */
  cancel: () => void;
  /** 時間割の全体（モックの再生の速さを変えるため） */
  timeline: gsap.core.Timeline;
}

// 秒数（ミリ秒）
const CRACKS = [0, 170, 340]; // ひびが広がる 3 段
const GROW = 110; // ひび 1 本が伸びきるまで
const BREAK = 560; // 砕ける
const STOP = 70; // 砕けた瞬間に止める
const FLY = 640; // 破片が画面のこちらまで来る
const HIT = BREAK + STOP + FLY; // 最後の破片が画面に当たる
const SCATTER = 900; // ほかの破片が散って落ちる
const COVER = 90; // 暗転しきるまで
const HOLD = 260; // 暗いまま
const REVEAL = 520; // 明けて結果が見える
const FLASH = 140; // 白く抜ける：白くなりきるまで
const SPIDER = 380; // 画面にひび：ひびが画面の端まで走る
const DIM = 420; // 画面にひび：暗くなりきるまで

const RAYS = 9; // ひびの放射の数
const HEROES = 3; // こちらへ飛んでくる破片の数
const SCREEN_RAYS = 14; // 画面のひびの放射の数

const s = (ms: number) => ms / 1000;

/** 要素を、見た目（計算済みのスタイル）ごと写す。どこに置いても同じ姿になる */
function snapshot(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  const from = [el, ...el.querySelectorAll("*")] as (HTMLElement | SVGElement)[];
  const to = [copy, ...copy.querySelectorAll("*")] as (HTMLElement | SVGElement)[];
  from.forEach((src, i) => {
    const dst = to[i];
    if (!dst) return;
    const cs = getComputedStyle(src);
    for (let k = 0; k < cs.length; k++) {
      const name = cs.item(k);
      dst.style.setProperty(name, cs.getPropertyValue(name));
    }
    dst.style.animation = "none";
    dst.style.transition = "none";
    // 写しが、演出の対象を探す data 属性（data-master など）に引っかからないように外す
    for (const a of [...dst.attributes])
      if (a.name.startsWith("data-") || a.name === "id") dst.removeAttribute(a.name);
  });
  return copy;
}

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

/** ひび 1 本（太い下の線 under の上に、細い線 over）。破線の長さで、伸びる動きを付ける */
function crackLine(
  parent: SVGElement,
  a: P,
  b: P,
  under: string,
  over: string,
  width: number,
): SVGLineElement[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return [
    [under, width * 2],
    [over, width],
  ].map(([color, w]) => {
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

export function lifeBreak(bar: HTMLElement, opts: LifeBreakOptions): LifeBreak {
  const rnd = opts.random ?? Math.random;
  const end = opts.end ?? "dark";
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
  const segs: { lines: SVGLineElement[]; stage: number; delay: number }[] = [];
  vtx.forEach((ray, i) => {
    const next = vtx[(i + 1) % RAYS] as P[];
    ray.forEach((v, j) => {
      const from = j === 0 ? o : (ray[j - 1] as P);
      // 放射のひびは、出どころに近いほど太い。輪のひびは内側だけ、ところどころ（クモの巣に見えすぎないように）
      segs.push({
        lines: crackLine(crackSvg, from, v, "#fffffff2", "#0d1729f0", Math.max(1.4, 2.8 - j * 0.45)),
        stage: stageOf(j),
        delay: 0,
      });
      if (j < 3 && rnd() < 0.7)
        segs.push({
          lines: crackLine(crackSvg, v, next[j] as P, "#ffffffd9", "#0d1729cc", 1.3),
          stage: stageOf(j),
          delay: 60,
        });
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
  const snap = snapshot(bar);
  Object.assign(snap.style, {
    position: "absolute",
    left: "0",
    top: "0",
    margin: "0",
    opacity: "1",
    visibility: "visible",
    translate: "none",
    filter: "none",
    transformOrigin: "0 0",
    transform: `scale(${scale})`,
  });
  type Shard = { el: HTMLElement; c: P; area: number; bw: number; bh: number };
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
      const el = box(r, {
        visibility: "hidden",
        transformOrigin: `${c.x}px ${c.y}px`,
        willChange: "transform",
      });
      const path = pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",");
      el.style.clipPath = `polygon(${path})`;
      el.appendChild(snap.cloneNode(true));
      // 破片のふち（割れたガラスの光るふち）
      const edge = svg(w, h);
      const pg = document.createElementNS(NS, "polygon");
      pg.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
      pg.setAttribute("fill", "none");
      pg.setAttribute("stroke", "#ffffff");
      pg.setAttribute("stroke-width", "2.4");
      pg.setAttribute("stroke-opacity", "0.9");
      edge.appendChild(pg);
      el.appendChild(edge);
      shards.push({
        el: place(el),
        c,
        area,
        bw: Math.max(...xs) - Math.min(...xs),
        bh: Math.max(...ys) - Math.min(...ys),
      });
    });
  });
  // こちらへ飛んでくる破片：出どころに近く、ある程度大きいもの。最後に真ん中へ来るのは、その中でいちばん大きいもの
  const byNear = [...shards]
    .filter((sh) => sh.area > (w * h) / 60)
    .sort((a, b) => Math.hypot(a.c.x - o.x, a.c.y - o.y) - Math.hypot(b.c.x - o.x, b.c.y - o.y))
    .slice(0, HEROES)
    .sort((a, b) => a.area - b.area);
  const heroes = new Set(byNear);
  const rest = shards.filter((sh) => !heroes.has(sh));

  const flash = place(
    box(
      { left: r.left + o.x - 90, top: r.top + o.y - 90, width: 180, height: 180 },
      {
        borderRadius: "50%",
        background: "radial-gradient(circle, #ffffff 0%, #d6f2ffcc 28%, #7fd0ff44 52%, transparent 72%)",
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
  tl.fromTo(
    flash,
    { scale: 0.3, opacity: 1 },
    { scale: 1.8, opacity: 0, duration: s(300), ease: "power2.out", immediateRender: false },
    s(BREAK),
  );
  if (opts.board) jolt(tl, [opts.board], BREAK, 7, 340, rnd);
  // 割れた瞬間、破片が少しだけ離れて止まる
  for (const sh of shards) {
    const d = Math.hypot(sh.c.x - o.x, sh.c.y - o.y) || 1;
    tl.set(sh.el, { x: ((sh.c.x - o.x) / d) * 3, y: ((sh.c.y - o.y) / d) * 3 }, s(BREAK));
  }

  // ---------- 3. 飛んでくる ----------
  // ほかの破片：外へはじけて、回りながら落ちる（少しこちらへ近づく）
  const motion = rest.map((sh) => {
    const dx = sh.c.x - o.x;
    const dy = sh.c.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    const v = 260 + rnd() * 300;
    return {
      sh,
      vx: (dx / d) * v,
      vy: (dy / d) * v * 0.6 - (140 + rnd() * 220),
      spin: (rnd() - 0.5) * 760,
      rx: (rnd() - 0.5) * 600,
      ry: (rnd() - 0.5) * 600,
      grow: 0.3 + rnd() * 0.7,
    };
  });
  const fall = { t: 0 };
  tl.to(
    fall,
    {
      t: s(SCATTER),
      duration: s(SCATTER),
      ease: "none",
      onUpdate: () => {
        const t = fall.t;
        const fade = Math.min(1, Math.max(0, (t - 0.42) / 0.38));
        for (const m of motion)
          gsap.set(m.sh.el, {
            x: m.vx * t,
            y: m.vy * t + 0.5 * 1500 * t * t,
            rotation: m.spin * t,
            rotationX: m.rx * t,
            rotationY: m.ry * t,
            scale: 1 + m.grow * t,
            opacity: 1 - fade,
            transformPerspective: 700,
          });
      },
    },
    s(BREAK + STOP),
  );

  // こちらへ飛んでくる破片：遠くから近づくように、はじめはゆっくり、最後に一気に大きくなる（遠近の大きさの変わり方）。
  // 2 つは画面の外へ抜け、最後の 1 つ（いちばん大きい）が画面の真ん中へ来る
  const fc: P = { x: frame.left + frame.width / 2, y: frame.top + frame.height * 0.46 };
  [...heroes].forEach((sh, k) => {
    const last = k === heroes.size - 1;
    const start: P = { x: r.left + sh.c.x, y: r.top + sh.c.y };
    const side = k % 2 === 0 ? -1 : 1;
    const target: P = last
      ? fc
      : { x: fc.x + side * frame.width * 1.25, y: fc.y + (k === 0 ? -0.5 : 0.45) * frame.height };
    // 最後の破片は、画面いっぱい（dark・white）か、画面に当たって止まる大きさ（crack）まで
    const fill = Math.max(frame.width / Math.max(8, sh.bw), frame.height / Math.max(8, sh.bh)) * 2.2;
    const big = last ? (end === "crack" ? Math.min(fill, 4.2) : fill) : Math.min(fill, 9);
    // 画面の外へ抜ける破片は、最後の 1 つより先に抜ける
    const dur = last ? FLY : FLY - (HEROES - k) * 70;
    // 最後の破片は、画面を覆う直前に影になっていく（dark）・白く光っていく（white）。filter より軽い、上に重ねた幕で
    const shade = last && end !== "crack" ? document.createElement("div") : null;
    if (shade) {
      Object.assign(shade.style, {
        position: "absolute",
        inset: "0",
        background: end === "white" ? "#ffffff" : "#03060c",
        opacity: "0",
      });
      sh.el.appendChild(shade);
    }
    const turn = (rnd() < 0.5 ? -1 : 1) * (160 + rnd() * 120);
    const tilt = { x: 40 + rnd() * 30, y: 40 + rnd() * 30 };
    const p = { v: 0 };
    tl.to(
      p,
      {
        v: 1,
        duration: s(dur),
        ease: "none",
        onUpdate: () => {
          const v = p.v;
          const z = 1 / (1 - v * (1 - 1 / big));
          // 遠近：大きくなるほど、目指す点へ寄っていく
          const k2 = (z - 1) / (big - 1 || 1);
          const x = start.x + (target.x - start.x) * k2;
          const y = start.y + (target.y - start.y) * k2;
          const wob = Math.sin(v * Math.PI * 1.5) * (1 - v);
          gsap.set(sh.el, {
            x: x - start.x,
            y: y - start.y,
            scale: z,
            rotation: turn * (1 - (1 - v) ** 2),
            rotationX: tilt.x * wob,
            rotationY: -tilt.y * wob,
            transformPerspective: 900,
            opacity: last ? 1 : 1 - Math.max(0, (v - 0.8) / 0.2),
          });
          if (shade) shade.style.opacity = String(0.7 * Math.max(0, (v - 0.7) / 0.3));
        },
      },
      s(BREAK + STOP),
    );
    if (!last) tl.set(sh.el, { visibility: "hidden" }, s(BREAK + STOP + dur));
  });

  // ---------- 4. 切り替え ----------
  const cover = place(
    box(frame, { background: end === "white" ? "#ffffff" : "#03060c", opacity: "0", visibility: "hidden" }),
  );
  // 覆い終えた破片は、隠すのではなく外す（画面より大きく拡大した破片は、隠しても絵が残ることがあった）
  const hideShards = () => {
    for (const sh of shards) sh.el.remove();
  };
  let covered = 0;
  if (end === "dark") {
    tl.set(cover, { visibility: "visible" }, s(HIT - COVER * 0.4));
    tl.to(cover, { opacity: 1, duration: s(COVER), ease: "power2.in" }, s(HIT - COVER * 0.4));
    tl.call(hideShards, [], s(HIT + COVER));
    covered = HIT + COVER + HOLD;
  } else if (end === "white") {
    tl.set(cover, { visibility: "visible" }, s(HIT - FLASH * 0.6));
    tl.to(cover, { opacity: 1, duration: s(FLASH), ease: "power2.in" }, s(HIT - FLASH * 0.6));
    tl.call(hideShards, [], s(HIT + FLASH * 0.4));
    covered = HIT + FLASH * 0.4 + HOLD * 0.8;
  } else {
    // 画面にひび：最後の破片が当たった所から、画面の端までひびが走る
    const hero = byNear[byNear.length - 1];
    const at: P = { x: fc.x - frame.left, y: fc.y - frame.top };
    const glass = place(box(frame, { visibility: "hidden" }));
    const gs = svg(frame.width, frame.height);
    glass.appendChild(gs);
    const reach = Math.hypot(frame.width, frame.height);
    const screenStep = (Math.PI * 2) / SCREEN_RAYS;
    const sb = rnd() * screenStep;
    const ringR = [0.07, 0.17, 0.32, 0.55].map((v) => v * reach);
    const sv = Array.from({ length: SCREEN_RAYS }, (_, i) => {
      const a = sb + i * screenStep + (rnd() - 0.5) * screenStep * 0.5;
      return [...ringR, reach].map((rr, j) => {
        const t = a + (rnd() - 0.5) * screenStep * 0.14;
        const k = j === ringR.length ? 1 : 1 + (rnd() - 0.5) * 0.3;
        return { x: at.x + Math.cos(t) * rr * k, y: at.y + Math.sin(t) * rr * k, j };
      });
    });
    sv.forEach((ray, i) => {
      const next = sv[(i + 1) % SCREEN_RAYS] as typeof ray;
      ray.forEach((v, j) => {
        const from = j === 0 ? at : (ray[j - 1] as P);
        const delay = (j / ray.length) * SPIDER * 0.75;
        tl.to(
          crackLine(gs, from, v, "#000000a6", "#eaf7ffee", 1.6),
          { strokeDashoffset: 0, duration: s(SPIDER * 0.3), ease: "power2.out" },
          s(HIT + delay),
        );
        // 輪のひびは内側の 3 つだけ、ところどころ
        if (j < 3 && rnd() < 0.75)
          tl.to(
            crackLine(gs, v, next[j] as P, "#0000008c", "#d9f0ffd9", 1.2),
            { strokeDashoffset: 0, duration: s(SPIDER * 0.25), ease: "power1.out" },
            s(HIT + delay + 50),
          );
      });
    });
    const dot = place(
      box(
        { left: fc.x - 70, top: fc.y - 70, width: 140, height: 140 },
        {
          borderRadius: "50%",
          background: "radial-gradient(circle, #ffffff 0%, #ffffffaa 25%, transparent 65%)",
          opacity: "0",
        },
      ),
    );
    // 暗くなる幕は、ひびの下に置く（ひびが見えたまま暗転する）
    layer.appendChild(cover);
    layer.appendChild(glass);
    tl.set(glass, { visibility: "visible" }, s(HIT));
    tl.fromTo(
      dot,
      { scale: 0.4, opacity: 1 },
      { scale: 1.6, opacity: 0, duration: s(260), ease: "power2.out", immediateRender: false },
      s(HIT),
    );
    if (opts.board) jolt(tl, [opts.board], HIT, 9, 300, rnd);
    if (hero) {
      // 当たった破片はガラスに一瞬貼りつき、ずり落ちながら消える
      tl.to(
        hero.el,
        { y: `+=${frame.height * 0.18}`, opacity: 0, duration: s(520), ease: "power2.in" },
        s(HIT + 120),
      );
    }
    tl.call(hideShards, [], s(HIT + SPIDER + 120 + DIM));
    tl.set(cover, { visibility: "visible" }, s(HIT + SPIDER + 120));
    tl.to(cover, { opacity: 1, duration: s(DIM), ease: "power1.in" }, s(HIT + SPIDER + 120));
    covered = HIT + SPIDER + 120 + DIM + 80;
    tl.to(glass, { opacity: 0, duration: s(REVEAL), ease: "power2.out" }, s(covered));
  }
  tl.call(() => opts.onCovered?.(), [], s(covered));
  tl.to(cover, { opacity: 0, duration: s(REVEAL), ease: "power2.out" }, s(covered));

  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  tl.eventCallback("onComplete", () => {
    for (const el of placed) if (el !== cover) el.remove();
    cover.remove();
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
