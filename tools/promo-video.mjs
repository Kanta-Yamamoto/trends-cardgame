// SNS に出す、カード 1 枚を傾けて見せる短い動画を作る道具（docs/promo-video.md）。
// 使い方（先に pnpm dev で web を立ち上げておく）：
//   pnpm promo:video c17          … 『演出家』を 8 秒撮って sns/c17.mp4 に書き出す
//   pnpm promo:video c17 8.1      … 秒数を決める（カード面の動きの一周に合わせる）
//   pnpm promo:video c1 8 dark    … 闇堕ちの姿で撮る（sns/c1-dark.mp4）
// 撮影用のページ（apps/web/promo.html）を、手元の Chrome で開いて撮る。撮り先は TRENDS_WEB で変えられる。
//
// 1 コマずつ止めて撮る（1 コマに 0.5 秒ほどかかる）。そのあいだにカード面の動きが先へ進まないよう、
// JS の動き（performance.now・requestAnimationFrame）は Playwright の時計を止めて、CSS の動きは currentTime で、
// どちらも 1 コマ分ずつ進める。だから撮るのが遅くても、出た瞬間からの動きが実際と同じ速さで映る
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = process.env.TRENDS_WEB ?? "http://localhost:5173";
const [card, secArg = "8", form = ""] = process.argv.slice(2);
if (!card) {
  console.error("使い方：pnpm promo:video <カードの ID> [秒] [dark]");
  process.exit(1);
}
const dark = form === "dark";
const SEC = Number(secArg);
const FPS = 60;
const DT = 1000 / FPS;
const OUT_DIR = join(ROOT, "sns");
const out = join(OUT_DIR, `${card}${dark ? "-dark" : ""}.mp4`);

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

const ffmpeg = ffmpegPath();
mkdirSync(OUT_DIR, { recursive: true });

// 手元の Chrome で撮る（縦長 4:5 を、2 倍の細かさで 1080×1350 に）
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2 });
await page.clock.install({ time: new Date("2026-01-01T00:00:00") });
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

// 最初のコマは、カード面の動きが描かれる前の形なので撮らない
const frames = Math.round(FPS * SEC) + 1;
for (let i = 0; i < frames; i++) {
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
  if (i > 0) {
    const png = await page.screenshot({ type: "png", timeout: 120_000 });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  // 次のコマへ：CSS の動きと JS の時計を 1 コマ分だけ進める
  await page.evaluate((dt) => {
    for (const a of document.getAnimations()) {
      if (!window.__seen.has(a)) {
        window.__seen.add(a);
        a.pause();
        a.currentTime = 0;
      }
      a.currentTime = (a.currentTime ?? 0) + dt;
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
