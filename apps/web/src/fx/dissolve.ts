import { gsap } from "gsap";
import type { Filter, Texture } from "pixi.js";
import { type FxStage, fxEnabled, fxStage, type Pixi } from "./stage";

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 体力がなくなったアイコンが、黒く染まって溶けるように消える。
 * 1. カード（DOM の抜け殻）が一瞬で黒く沈む
 * 2. 同じ形の黒い板（PixiJS）に入れ替わり、上から下へ、まだらに溶けて消える。溶けるふちが灰色に淡く光る
 * 3. 溶けたところから黒い煙と灰が立ちのぼる
 * 元のカードは React がすぐ消すので、呼ぶ側が抜け殻（ghost）を作って渡す。
 */
export async function dissolve(ghost: HTMLElement): Promise<void> {
  const r = ghost.getBoundingClientRect();
  const sink = ghost.animate(
    [
      { filter: "brightness(1) grayscale(0)", transform: "none" },
      { filter: "brightness(1.6) grayscale(0.4)", transform: "scale(1.04)", offset: 0.25 },
      { filter: "brightness(0.06) grayscale(1)", transform: "scale(1.02)" },
    ],
    { duration: 260, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
  );
  if (!fxEnabled()) {
    await ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 260, fill: "forwards" })
      .finished;
    ghost.remove();
    return;
  }
  const stage = await fxStage();
  await sink.finished.catch(() => {});
  if (!stage) {
    ghost.remove();
    return;
  }
  try {
    await melt(stage, r, () => ghost.remove());
  } catch (e) {
    console.warn("[fx] dissolve", e);
    ghost.remove();
  }
}

async function melt(stage: FxStage, r: Rect, swapped: () => void) {
  const { pixi, root, tex } = stage;
  const k = r.width / 80;
  const fx = new pixi.Container();
  fx.position.set(r.left, r.top);
  root.addChild(fx);
  const release = stage.hold();

  // 溶け方の模様（R にまだらの値、A にカードの形）を焼いた板
  const mask = noiseTexture(pixi, r.width, r.height);
  const slab = new pixi.Sprite(mask);
  slab.width = r.width;
  slab.height = r.height;
  const filter = dissolveFilter(pixi);
  slab.filters = [filter];
  fx.addChild(slab);
  swapped();

  const smoke = new pixi.Container();
  fx.addChild(smoke);
  const tl = gsap.timeline();
  const u = filter.resources.dissolve.uniforms as { uProgress: number };
  u.uProgress = 0;
  tl.to(u, { uProgress: 1.08, duration: 0.85, ease: "sine.in" }, 0);
  // 溶けながら少しだけ下へ垂れる
  tl.to(slab, { y: r.height * 0.04, duration: 0.85, ease: "power1.in" }, 0);

  // 煙：溶けているあたり（上から下へ進む）から、ゆっくり立ちのぼる
  const puffs = 10;
  for (let i = 0; i < puffs; i++) {
    const at = (i / puffs) * 0.7;
    const p = new pixi.Sprite(tex.puff);
    p.anchor.set(0.5);
    p.tint = i % 2 ? 0x2a2433 : 0x3d3549;
    p.alpha = 0;
    const s = ((r.width * (0.5 + Math.random() * 0.4)) / tex.puff.width) * 1;
    p.scale.set(s * 0.5);
    p.position.set(r.width * (0.15 + Math.random() * 0.7), r.height * (0.12 + (i / puffs) * 0.8));
    p.rotation = Math.random() * Math.PI * 2;
    smoke.addChild(p);
    tl.to(p, { alpha: 0.75, duration: 0.18 }, at)
      .to(
        p,
        {
          y: p.y - r.height * (0.35 + Math.random() * 0.3),
          x: p.x + (Math.random() - 0.5) * r.width * 0.4,
          rotation: p.rotation + (Math.random() - 0.5),
          duration: 0.9,
          ease: "power1.out",
        },
        at,
      )
      .to(p.scale, { x: s * 1.3, y: s * 1.3, duration: 0.9, ease: "power1.out" }, at)
      .to(p, { alpha: 0, duration: 0.5, ease: "power1.in" }, at + 0.4);
  }
  // 灰：小さな粒が舞い上がる
  for (let i = 0; i < 14; i++) {
    const at = Math.random() * 0.65;
    const a = new pixi.Sprite(tex.glow);
    a.anchor.set(0.5);
    a.tint = i % 3 === 0 ? 0xb9adcf : 0x5d5470;
    a.blendMode = i % 3 === 0 ? "add" : "normal";
    a.alpha = 0;
    a.scale.set(((2 + Math.random() * 2.5) * k) / (tex.glow.width / 4));
    a.position.set(r.width * Math.random(), r.height * (0.1 + at * 1.1));
    smoke.addChild(a);
    tl.to(a, { alpha: 0.9, duration: 0.08 }, at)
      .to(
        a,
        {
          y: a.y - r.height * (0.4 + Math.random() * 0.5),
          x: a.x + (Math.random() - 0.5) * r.width * 0.6,
          duration: 0.8 + Math.random() * 0.3,
          ease: "sine.out",
        },
        at,
      )
      .to(a, { alpha: 0, duration: 0.35 }, at + 0.55);
  }

  await tl.then();
  fx.destroy({ children: true });
  mask.destroy(true);
  release();
}

/**
 * 溶ける模様のシェーダー。
 * 板の R＝まだらの値（小さいところから先に消える）、A＝カードの形。
 * uProgress より小さいところは消え、そのすぐ上の帯がふちとして灰色に光る。
 */
function dissolveFilter(pixi: Pixi): Filter {
  const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uProgress;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a <= 0.0) { finalColor = vec4(0.0); return; }
  float n = c.r / c.a;
  float edge = 0.07;
  float d = n - uProgress;
  if (d < 0.0) { finalColor = vec4(0.0); return; }
  vec3 body = vec3(0.035, 0.03, 0.05);
  vec3 rim = vec3(0.62, 0.57, 0.72);
  float t = smoothstep(edge, 0.0, d);
  vec3 col = mix(body, rim, t * t);
  float a = c.a * mix(1.0, 0.85, t);
  finalColor = vec4(col * a, a);
}`;
  return new pixi.Filter({
    glProgram: pixi.GlProgram.from({ vertex: pixi.defaultFilterVert, fragment, name: "trends-dissolve" }),
    resources: {
      dissolve: new pixi.UniformGroup({ uProgress: { value: 0, type: "f32" } }),
    },
  });
}

type Octave = { cells: number; g: number[] };

/** 溶ける模様：なめらかなまだら（値ノイズを重ねたもの）に、上ほど先に溶ける傾きを足す。角は丸く切る */
function noiseTexture(pixi: Pixi, w: number, h: number): Texture {
  // 小さく作って引き伸ばす（なめらかになり、計算も軽い）
  const sw = 40;
  const sh = Math.max(8, Math.round((40 * h) / w));
  const grid = (n: number) => Array.from({ length: (n + 2) * (n + 2) }, () => Math.random());
  const [o1, o2, o3] = [4, 8, 16].map((cells) => ({ cells, g: grid(cells) })) as [Octave, Octave, Octave];
  const sample = ({ cells, g }: Octave, x: number, y: number) => {
    const gx = x * cells;
    const gy = y * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const at = (i: number, j: number) => g[j * (cells + 2) + i] ?? 0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  };
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sg = small.getContext("2d");
  if (sg) {
    const img = sg.createImageData(sw, sh);
    const raw: number[] = [];
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const u = x / sw;
        const v = y / sh;
        const fbm = sample(o1, u, v) * 0.55 + sample(o2, u, v) * 0.3 + sample(o3, u, v) * 0.15;
        raw.push(fbm * 0.6 + v * 0.4);
      }
    }
    // 0〜1 に広げる（溶け始めから溶け終わりまで、時間をまるごと使う）
    const lo = Math.min(...raw);
    const hi = Math.max(...raw);
    raw.forEach((n, j) => {
      const v = Math.round(((n - lo) / (hi - lo || 1)) * 255);
      img.data[j * 4] = img.data[j * 4 + 1] = img.data[j * 4 + 2] = v;
      img.data[j * 4 + 3] = 255;
    });
    sg.putImageData(img, 0, 0);
  }
  const big = document.createElement("canvas");
  const res = Math.min(window.devicePixelRatio || 1, 2);
  big.width = Math.round(w * res);
  big.height = Math.round(h * res);
  const g = big.getContext("2d");
  if (g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const rad = big.width * 0.09;
    g.beginPath();
    g.roundRect(0, 0, big.width, big.height, rad);
    g.clip();
    g.drawImage(small, 0, 0, big.width, big.height);
  }
  return pixi.Texture.from(big);
}
