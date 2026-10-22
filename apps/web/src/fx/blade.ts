import { gsap } from "gsap";

/**
 * 『調停者』の一撃：青白い刃が対象のアイコンに重く突き刺さる（見た目だけ。ルールは game-core）。
 * 1. 現れる（0.22 秒）：対象の左上の宙に、光でできた細い刃が浮かぶ。刃の上を光がすべる
 * 2. 溜め（0.2 秒）：わずかに引く（ゆっくり）
 * 3. 突き（0.07 秒）：一気に貫く（速く）
 * 4. 衝撃（止め 0.12 秒）：画面が白く光り、ひびと光の筋が走り、盤面が大きく揺れる。カードは白く飛ぶ
 * 5. 刺さったまま少し止まり（0.3 秒）、すっと抜けて消える
 * 刃の向きは絵の刀と同じ、左上から右下へ。対象が敵か味方かで変えない（敵味方構わず裁く）
 */

const ANGLE = 72; // 刃の向き（右向きから時計回り。左上から右下へ、ほぼ真上から突き下ろす）

function layer(): HTMLElement {
  let el = document.getElementById("fx-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-layer";
    document.body.appendChild(el);
  }
  return el;
}

const put = (cls: string, style: Partial<CSSStyleDeclaration>) => {
  const n = document.createElement("div");
  n.className = cls;
  Object.assign(n.style, style);
  layer().appendChild(n);
  return n;
};

/** 盤面を重く揺らす */
function quake(power: number) {
  const board = document.querySelector<HTMLElement>(".board");
  if (!board) return;
  const p = 7 * power;
  board.animate(
    [
      { transform: "translate(0,0)" },
      { transform: `translate(${p * 0.6}px, ${p}px)` },
      { transform: `translate(${-p * 0.5}px, ${-p * 0.7}px)` },
      { transform: `translate(${p * 0.35}px, ${p * 0.4}px)` },
      { transform: `translate(${-p * 0.15}px, ${-p * 0.1}px)` },
      { transform: "translate(0,0)" },
    ],
    { duration: 420, easing: "cubic-bezier(.2,.7,.3,1)" },
  );
}

/** 貫いた点から走るひび（カードの上に残り、少しして消える） */
function crack(cx: number, cy: number, size: number) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "fx-crack");
  const s = size * 1.1;
  Object.assign(svg.style, {
    left: `${cx - s}px`,
    top: `${cy - s}px`,
    width: `${s * 2}px`,
    height: `${s * 2}px`,
  });
  svg.setAttribute("viewBox", "-100 -100 200 200");
  // 枝分かれするひび：決まった形（毎回同じ。乱数で形が暴れないように）
  const arms = [
    [0, 0, 18, -26, 30, -40, 52, -58],
    [0, 0, -22, 14, -46, 22, -70, 40],
    [0, 0, 26, 10, 44, 28, 72, 34],
    [0, 0, -10, -24, -28, -38, -34, -66],
    [0, 0, 6, 30, 0, 52, 12, 78],
    [30, -40, 44, -30, 60, -36],
    [-46, 22, -54, 8, -70, 2],
  ];
  for (const a of arms) {
    const pl = document.createElementNS(ns, "polyline");
    const pts: string[] = [];
    for (let i = 0; i < a.length; i += 2) pts.push(`${a[i]},${a[i + 1]}`);
    pl.setAttribute("points", pts.join(" "));
    svg.appendChild(pl);
  }
  layer().appendChild(svg);
  svg.animate(
    [
      { opacity: 0, transform: "scale(0.6)" },
      { opacity: 1, transform: "scale(1)", offset: 0.08 },
      { opacity: 1, offset: 0.7 },
      { opacity: 0 },
    ],
    { duration: 1000, easing: "cubic-bezier(.1,.8,.3,1)" },
  ).onfinish = () => svg.remove();
}

/** 衝撃の瞬間：白い閃光・光の筋・輪 */
function flash(cx: number, cy: number, size: number) {
  const f = put("fx-judge-flash", {
    background: `radial-gradient(circle at ${cx}px ${cy}px, #ffffff 0, #cfe0ffcc 8%, #4d6fff55 26%, transparent 60%)`,
  });
  f.animate([{ opacity: 1 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }], {
    duration: 420,
    easing: "ease-out",
  }).onfinish = () => f.remove();

  const ring = put("fx-judge-ring", {
    left: `${cx}px`,
    top: `${cy}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  ring.animate(
    [
      { transform: "translate(-50%,-50%) scale(0.15)", opacity: 1, borderWidth: "6px" },
      { transform: "translate(-50%,-50%) scale(2.6)", opacity: 0, borderWidth: "1px" },
    ],
    { duration: 520, easing: "cubic-bezier(.1,.7,.3,1)" },
  ).onfinish = () => ring.remove();

  // 光の筋：貫いた点から 8 方向へ、一瞬で伸びて消える
  for (let i = 0; i < 8; i++) {
    const a = i * 45 + (i % 2 ? 12 : -6);
    const len = size * (i % 2 ? 0.9 : 1.4);
    const ray = put("fx-judge-ray", {
      left: `${cx}px`,
      top: `${cy}px`,
      width: `${len}px`,
      rotate: `${a}deg`,
    });
    ray.animate(
      [
        { transform: "scaleX(0.05)", opacity: 1 },
        { transform: "scaleX(1)", opacity: 0.9, offset: 0.4 },
        { transform: "scaleX(1.15)", opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(.1,.8,.3,1)" },
    ).onfinish = () => ray.remove();
  }
}

/**
 * el のアイコンに刃を突き刺す。delayMs 後に始め、刃が抜けて消えたら終わる。
 * onImpact は貫いた瞬間に呼ぶ（カードを消す演出などを合わせる）
 */
export async function pierce(el: HTMLElement | null, delayMs = 0, onImpact?: () => void): Promise<void> {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.42;
  const H = Math.max(r.height, 60);
  const L = Math.max(H * 1.8, 130); // 刃の長さ
  const T = Math.max(22, H * 0.34); // 刃の太さ（光のふちを含む）
  const back = H * 0.75; // 刺さる前の、刃先と的の距離

  // 外側は向きだけ（刃先を軸に回す）。内側を刃の向きに沿って動かす
  const axis = put("fx-blade-axis", {
    left: `${cx - L}px`,
    top: `${cy - T / 2}px`,
    width: `${L}px`,
    height: `${T}px`,
    transformOrigin: "100% 50%",
    rotate: `${ANGLE}deg`,
  });
  const blade = document.createElement("div");
  blade.className = "fx-blade";
  axis.appendChild(blade);

  const tl = gsap.timeline({ delay: delayMs / 1000 });
  gsap.set(blade, { x: -back, opacity: 0, scaleY: 0.2 });
  await new Promise<void>((done) => {
    tl
      // 1. 現れる
      .to(blade, { opacity: 1, scaleY: 1, duration: 0.22, ease: "power2.out" })
      .fromTo(blade, { "--glint": "-30%" }, { "--glint": "130%", duration: 0.34, ease: "power1.inOut" }, "<")
      .add(() => {
        el.classList.add("fx-judged");
      }, "<")
      // 2. 溜め
      .to(blade, { x: -back - H * 0.16, duration: 0.2, ease: "sine.out" })
      // 3. 突き
      .to(blade, { x: H * 0.28, duration: 0.07, ease: "power4.in" })
      // 4. 衝撃：止める
      .add(() => {
        flash(cx, cy, H * 0.9);
        crack(cx, cy, H * 0.55);
        quake(1.7);
        el.animate(
          [
            { filter: "brightness(3) saturate(0)", transform: "translate(0,0) scale(1.04)" },
            {
              filter: "brightness(2.2) saturate(0.3)",
              transform: "translate(5px,7px) scale(1.02)",
              offset: 0.3,
            },
            { filter: "brightness(1.4)", transform: "translate(-4px,-3px)", offset: 0.6 },
            { filter: "brightness(1)", transform: "translate(0,0)" },
          ],
          { duration: 460, easing: "ease-out" },
        );
        onImpact?.();
      })
      .to({}, { duration: 0.12 })
      // わずかに押し込んで、刺さったまま止まる
      .to(blade, { x: H * 0.34, duration: 0.3, ease: "power2.out" })
      // 5. 抜けて消える
      .to(blade, { x: -back * 0.6, opacity: 0, duration: 0.24, ease: "power2.in" })
      .add(() => {
        el.classList.remove("fx-judged");
        axis.remove();
        done();
      });
  });
}
