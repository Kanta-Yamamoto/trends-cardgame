// SNS に出す短い動画を作る道具（docs/promo-video.md）。先に pnpm dev で web を立ち上げておく。
//   pnpm promo:video c17          … 『演出家』のカードを 8 秒傾けて見せ、sns/c17.mp4 に書き出す（縦長 4:5）
//   pnpm promo:video c17 8.1      … 秒数を決める（カード面の動きの一周に合わせる）
//   pnpm promo:video c1 8 dark    … 闇堕ちの姿で撮る（sns/c1-dark.mp4）
//   pnpm promo:video scene god    … 本物の盤面で演出の場面を撮る（sns/scene-god.mp4。縦長 9:16。場面は SCENES）
// 撮影用のページ（apps/web/promo.html）を、手元の Chrome で開いて撮る。撮り先は TRENDS_WEB で変えられる。
//
// 1 コマずつ止めて撮る（1 コマに 0.5 秒ほどかかる）。そのあいだに画面の動きが先へ進まないよう、
// JS の動き（performance.now・requestAnimationFrame・setTimeout）は Playwright の時計を止めて、CSS・Web Animations の動きは
// currentTime で、どちらも 1 コマ分ずつ進める。だから撮るのが遅くても、実際と同じ速さで映る
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = process.env.TRENDS_WEB ?? "http://localhost:5173";
const FPS = 60;
const DT = 1000 / FPS;
const OUT_DIR = join(ROOT, "sns");

/** 手札の n 枚目・自分の枠・相手のプレイヤー（画面の部品の場所） */
const HAND = (n) => `[data-hand="p1"] [data-hand-card]:nth-child(${n + 1})`;
const SLOT = (n) => `[data-slot="p1:${n}"]`;
const ALLY = (n) => `[data-drop="ally:${n}"]`;
const FOE_LEADER = '[data-master="p2"]';

/**
 * 本物の盤面・開封の画面で撮る場面（apps/web/src/promo/scenes.tsx の盤面）。
 * steps は [秒, 操作]。drag は指でなぞるのと同じに、押して動かして離す（dur 秒かけて）。
 * taps は、部品が出るのを待ってから count 回、gap 秒おきに押す
 */
const SCENES = {
  god: { sec: 9, steps: [[0.4, { drag: [HAND(0), SLOT(2)] }]] },
  arbiter: { sec: 6, steps: [[0.4, { drag: [HAND(0), SLOT(2)] }]] },
  director: { sec: 7, steps: [[0.4, { drag: [HAND(0), SLOT(1)] }]] },
  fixer: {
    sec: 7,
    steps: [
      [0.4, { drag: [HAND(0), SLOT(1)] }],
      [2.8, { call: ["sacrifice", 0] }],
    ],
  },
  win: { sec: 8, steps: [[0.4, { drag: [ALLY(1), FOE_LEADER] }]] },
  // パックの上を横になぞって裂き、4 枚をすばやくめくって、5 枚目（★5 ミナモ）の当たり
  gacha: {
    sec: 12,
    steps: [
      [0.4, { drag: [".gx-pk-btn", ".gx-pk-btn"], from: [0.08, 0.1], to: [0.95, 0.1], dur: 0.45 }],
      [2.4, { taps: ".gx-tap", count: 9, gap: 0.22 }],
    ],
  },
};

/** ffmpeg の本体は、CI・Docker で落とさないよう、ここで初めて使うときに取りに行く */
function ffmpegPath() {
  const require = createRequire(import.meta.url);
  const bin = require("ffmpeg-static");
  if (!existsSync(bin)) {
    console.log("ffmpeg を取りに行きます（初回だけ）");
    const install = join(dirname(require.resolve("ffmpeg-static/package.json")), "install.js");
    const r = spawnSync(process.execPath, [install], { stdio: "inherit" });
    if (r.status !== 0 || !existsSync(bin)) throw new Error("ffmpeg を取り出せませんでした");
  }
  return bin;
}

const args = process.argv.slice(2);
const sceneName = args[0] === "scene" ? args[1] : null;
const scene = sceneName ? SCENES[sceneName] : null;
if (!args[0] || (sceneName !== null && !scene)) {
  console.error(
    `使い方：pnpm promo:video <カードの ID> [秒] [dark] ／ pnpm promo:video scene <${Object.keys(SCENES).join("|")}> [秒]`,
  );
  process.exit(1);
}
const card = scene ? null : args[0];
const dark = !scene && args[2] === "dark";
const SEC = Number((scene ? args[2] : args[1]) ?? scene?.sec ?? 8);
const out = join(OUT_DIR, scene ? `scene-${sceneName}.mp4` : `${card}${dark ? "-dark" : ""}.mp4`);

const ffmpeg = ffmpegPath();
mkdirSync(OUT_DIR, { recursive: true });

// 手元の Chrome で撮る。カードは縦長 4:5（1080×1350）、場面はスマホの縦の画面 9:16（1080×1920）
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage(
  scene
    ? { viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 }
    : { viewport: { width: 540, height: 675 }, deviceScaleFactor: 2 },
);
await page.clock.install({ time: new Date("2026-01-01T00:00:00") });
if (scene) {
  // 場面は、出したあと時計を流したまま待ち、演出の舞台（PixiJS）・絵・書体を用意させてから止める
  await page.goto(`${WEB}/promo.html?scene=${sceneName}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(5000);
  // 重いときは時計を読んでから止めるまでに時間がかかるので、少し先で止める
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await page.evaluate(() => {
    window.__seen = new WeakSet();
    for (const a of document.getAnimations()) {
      a.pause();
      window.__seen.add(a);
    }
  });
} else {
  await page.goto(`${WEB}/promo.html?wait&card=${card}${dark ? "&dark" : ""}`);
  await page.evaluate(() => document.fonts.ready);
  // 時計を止めてからカードを出す。絵が読み込まれるまで実時間で待つ（止めた時計の動きは進まない）
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 100);
  await page.evaluate(() => window.showCard());
  // 傾きは毎コマ決めるので、遅れて付いてくる動きは外す
  await page.addStyleTag({ content: ".card{transition:none!important}" });
  await page.waitForTimeout(2000);
  // CSS の動きはカードが出たときに始まっているので、0 に戻して止める
  await page.evaluate(() => {
    window.__seen = new WeakSet();
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = 0;
      window.__seen.add(a);
    }
  });
}

const ff = spawn(
  ffmpeg,
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS),
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

/** 部品の中の位置（fx・fy は幅・高さに対する割合。省けば真ん中） */
async function pointOf(sel, [fx, fy] = [0.5, 0.5]) {
  const r = await page.evaluate((s) => {
    const b = document.querySelector(s)?.getBoundingClientRect();
    return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
  }, sel);
  if (!r) throw new Error(`画面に ${sel} がありません`);
  return { x: r.x + r.w * fx, y: r.y + r.h * fy };
}

/** コマの番号 → そのコマの前にすること。drag は押す・動かす・離すを、コマに割り振る */
const todo = new Map();
const at = (frame, fn) => todo.set(frame, [...(todo.get(frame) ?? []), fn]);
for (const [sec, step] of scene?.steps ?? []) {
  const f0 = Math.round(sec * FPS);
  if (step.drag) {
    const n = Math.max(2, Math.round((step.dur ?? 0.35) * FPS));
    let a;
    let b;
    at(f0, async () => {
      a = await pointOf(step.drag[0], step.from);
      b = await pointOf(step.drag[1], step.to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
    });
    for (let k = 1; k <= n; k++) {
      // ゆっくり持ち上げて、すっと動かし、置く前にゆるめる
      const u = k / n;
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      at(f0 + k, () => page.mouse.move(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e));
    }
    at(f0 + n + 1, () => page.mouse.up());
  } else if (step.click) {
    at(f0, async () => {
      const p = await pointOf(step.click);
      await page.mouse.click(p.x, p.y);
    });
  } else if (step.taps) {
    // 部品が出ていなければ次のコマで押し直す。押したら gap 秒あけて次を押す
    let left = step.count;
    const tap = (frame) => async () => {
      const there = await page.evaluate((s) => !!document.querySelector(s), step.taps);
      if (!there) return at(frame + 1, tap(frame + 1));
      const p = await pointOf(step.taps);
      await page.mouse.click(p.x, p.y);
      if (--left > 0) at(frame + Math.round(step.gap * FPS), tap(frame + Math.round(step.gap * FPS)));
    };
    at(f0, tap(f0));
  } else if (step.call) {
    const [fn, ...rest] = step.call;
    at(f0, () => page.evaluate(({ fn, rest }) => window.promo[fn](...rest), { fn, rest }));
  }
}

// 最初のコマは、カード面の動きが描かれる前の形なので撮らない
const frames = Math.round(FPS * SEC) + 1;
for (let i = 0; i < frames; i++) {
  for (const fn of todo.get(i) ?? []) await fn();
  if (card) {
    await page.evaluate(
      ({ t, sec }) => {
        const el = document.querySelector(".card");
        // 正面から始まって正面で終わる 8 の字（そのまま繰り返してもつながる）
        const x = 0.85 * Math.sin((2 * Math.PI * t * 2) / sec);
        const y = 0.5 * Math.sin((2 * Math.PI * t) / sec);
        const g = 0.4 + 0.5 * Math.min(1, Math.hypot(x, y));
        // HoloCard.tsx の setTilt と同じ値
        const set = (k, v) => el.style.setProperty(k, v);
        set("--nx", x.toFixed(3));
        set("--ny", y.toFixed(3));
        set("--ry", `${(x * 16).toFixed(2)}deg`);
        set("--rx", `${(-y * 13).toFixed(2)}deg`);
        set("--mx", `${(50 + x * 50).toFixed(1)}%`);
        set("--my", `${(50 + y * 50).toFixed(1)}%`);
        set("--g", g.toFixed(2));
      },
      { t: i / FPS, sec: SEC },
    );
  }
  if (i > 0) {
    const png = await page.screenshot({ type: "png", timeout: 120_000 });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  // 次のコマへ：CSS・Web Animations の動きと JS の時計を 1 コマ分だけ進める。
  // 終わりに届いた動きは finish() で終わらせる（止めたままだと .finished を待つ演出が先へ進まない）
  await page.evaluate((dt) => {
    for (const a of document.getAnimations()) {
      if (!window.__seen.has(a)) {
        window.__seen.add(a);
        a.pause();
        a.currentTime = 0;
      }
      const end = a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY;
      const next = (Number(a.currentTime) || 0) + dt;
      // 端数の誤差で終わりのわずかに手前に止まると、動きが一覧から外れて終わりの処理が呼ばれないので、1ms の余裕を持たせる
      if (Number.isFinite(end) && next >= end - 1) {
        // 止めて進めた動きは finish の合図（onfinish）が来ないことがあるので、ここで呼ぶ（数字の札を消すなど）
        const done = a.onfinish;
        a.onfinish = null;
        a.finish();
        done?.call(a, new AnimationPlaybackEvent("finish"));
      } else a.currentTime = next;
    }
  }, DT);
  await page.clock.runFor(DT);
  if (i % FPS === 0) process.stdout.write(`\r${Math.round((i / frames) * 100)}%`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));
await browser.close();
if (code !== 0) throw new Error("動画を書き出せませんでした");
console.log(`\r${out}`);
