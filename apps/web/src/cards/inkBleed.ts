/**
 * 『フィクサー』の「白が滲んで黒になる」演出の形（見た目だけ）。カード面（faces/Fixer.tsx）と
 * バトル場の登場演出（game/FixerField.tsx）で共通に使う。
 *
 * 考え方：紙に墨が染みこむ速さの「場」を低い解像度で作っておき（ふちほど早く、focus のあたりほど遅い。
 * 細かいむらはノイズ）、その時々のしきい値より早い所を黒にする。境目は硬い線にせず、ぼかした濃さで
 * マスク（mask-image）にする。低い解像度のマスクを拡大して使うので、境目が自然ににじむ。
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 決まった乱数（毎回同じ形にする） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Bleed {
  w: number;
  h: number;
  field: Float32Array;
  canvas: HTMLCanvasElement | null;
}

/**
 * 滲みの場を作る。w・h はマスクの解像度（小さくてよい）。focus は最後まで白が残るところ（0〜1）
 */
export function makeBleed(w: number, h: number, seed = 11, focus: [number, number] = [0.5, 0.38]): Bleed {
  const r = rng(seed);
  const octs = [4, 8, 16, 32].map((n) => ({ n, g: Array.from({ length: (n + 1) * (n + 1) }, () => r()) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    let v = 0;
    let amp = 0.5;
    let tot = 0;
    for (const { n, g } of octs) {
      const fx = x * n;
      const fy = y * n;
      const ix = Math.min(n - 1, Math.floor(fx));
      const iy = Math.min(n - 1, Math.floor(fy));
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const at = (a: number, b: number) => g[b * (n + 1) + a] as number;
      const top = lerp(at(ix, iy), at(ix + 1, iy), tx);
      const bot = lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx);
      v += lerp(top, bot, ty) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return v / tot;
  };
  const field = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const ny = y / (h - 1);
      // ふちに近いほど早く黒くなる（中央ほど遅い）。focus のあたりが最後
      const edge = Math.min(nx, 1 - nx, ny * 0.8, 1 - ny) * 2;
      const core = Math.hypot((nx - focus[0]) / 0.5, (ny - focus[1]) / 0.62);
      field[y * w + x] = clamp01(0.5 * edge + 0.22 * (1 - Math.min(1, core)) + 0.42 * noise(nx, ny));
    }
  let lo = 1;
  let hi = 0;
  for (const v of field) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let k = 0; k < field.length; k++) field[k] = ((field[k] as number) - lo) / (hi - lo || 1);
  return { w, h, field, canvas: null };
}

/** 境目のぼかしの幅（場の値で） */
const SOFT = 0.16;

/** ゆっくり滲み始め、中ほどで少し速く、最後はまたゆっくり */
export const bleedEase = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** u（0＝真っ白、1＝真っ黒）のときの mask-image の値 */
export function bleedMask(b: Bleed, u: number): string {
  if (u <= 0) return "linear-gradient(transparent, transparent)";
  if (u >= 1) return "linear-gradient(#000, #000)";
  if (!b.canvas) {
    b.canvas = document.createElement("canvas");
    b.canvas.width = b.w;
    b.canvas.height = b.h;
  }
  const ctx = b.canvas.getContext("2d");
  if (!ctx) return "linear-gradient(#000, #000)";
  const img = ctx.createImageData(b.w, b.h);
  const th = lerp(-SOFT, 1 + SOFT, bleedEase(u));
  for (let k = 0; k < b.field.length; k++) {
    const a = clamp01((th - (b.field[k] as number) + SOFT) / (2 * SOFT));
    img.data[k * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return `url(${b.canvas.toDataURL()})`;
}

/**
 * キャンバスに、滲みを色付きで直接描く（u は bleedMask と同じ）。盤面の演出はこちらを使う。
 * 毎フレーム画像にして mask-image に渡すと、iPhone は画像の読み込みが間に合わないコマが抜けて、ちらつく（11月2日）
 */
export function paintBleed(
  canvas: HTMLCanvasElement,
  b: Bleed,
  u: number,
  [r, g, bl]: [number, number, number],
) {
  canvas.width = b.w;
  canvas.height = b.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(b.w, b.h);
  const th = lerp(-SOFT, 1 + SOFT, bleedEase(clamp01(u)));
  for (let k = 0; k < b.field.length; k++) {
    const a = u >= 1 ? 1 : u <= 0 ? 0 : clamp01((th - (b.field[k] as number) + SOFT) / (2 * SOFT));
    img.data[k * 4] = r;
    img.data[k * 4 + 1] = g;
    img.data[k * 4 + 2] = bl;
    img.data[k * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** 要素に滲みのマスクを当てる（大きさいっぱいに引き伸ばす） */
export function paintMask(el: HTMLElement, mask: string) {
  el.style.maskImage = mask;
  el.style.webkitMaskImage = mask;
  el.style.maskSize = "100% 100%";
  el.style.webkitMaskSize = "100% 100%";
}
