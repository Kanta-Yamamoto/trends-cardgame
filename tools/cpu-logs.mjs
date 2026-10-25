// CPU 対戦の記録を、本番から取り出して手元に溜め、ざっと見る道具（docs/cpu-logs.md）。
// 使い方（先に pnpm build でパッケージをビルドしておく）：
//   TRENDS_INVITE=合言葉 pnpm logs:cpu fetch    … 前回の続きから取り出して .claude/cpu-logs/ に保存する
//   pnpm logs:cpu summary                       … 溜めた記録の一覧と、デッキごとの勝ち負け・再生できるか
// 取り出し先は TRENDS_URL で変えられる（手元の API なら http://localhost:3001。そのときは合言葉は要らない）
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "../packages/cards/dist/index.js";
import { cardsStamp, replayRecord } from "../packages/game-core/dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, ".claude", "cpu-logs");
const CURSOR = join(DIR, "_cursor.txt");
const URL_BASE = process.env.TRENDS_URL ?? "https://trends-api-523738975867.asia-northeast1.run.app";
const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** 招待済みのクッキー（apps/api/src/security.ts の digest と同じ作り） */
function inviteCookie() {
  const code = process.env.TRENDS_INVITE?.trim();
  if (!code) return {};
  const v = createHash("sha256").update(`trends-invite:${code}`).digest("base64url");
  return { Cookie: `trends_invite=${v}` };
}

async function fetchAll() {
  mkdirSync(DIR, { recursive: true });
  let after = existsSync(CURSOR) ? readFileSync(CURSOR, "utf8").trim() : "";
  let total = 0;
  for (;;) {
    const q = new URLSearchParams({ limit: "100", ...(after ? { after } : {}) });
    const res = await fetch(`${URL_BASE}/logs/cpu-games?${q}`, { headers: inviteCookie() });
    if (!res.ok)
      throw new Error(
        `取り出せませんでした（HTTP ${res.status}）。合言葉（TRENDS_INVITE）を確かめてください`,
      );
    const { games } = await res.json();
    for (const g of games) {
      writeFileSync(join(DIR, `${g.createdAt.replace(/[:.]/g, "-")}_${g.id}.json`), JSON.stringify(g));
      after = g.createdAt;
    }
    total += games.length;
    if (after) writeFileSync(CURSOR, after);
    if (games.length < 100) break;
  }
  console.log(`新しい記録 ${total} 件を ${DIR} に保存しました`);
}

function summary() {
  const files = existsSync(DIR)
    ? readdirSync(DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];
  if (files.length === 0) return console.log("記録がありません（先に fetch）");
  const now = cardsStamp(catalog);
  const byDeck = new Map();
  for (const f of files) {
    const g = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const rec = g.record;
    let replay = "カードの版が違う";
    if (rec.cards === now) {
      const r = replayRecord(rec, catalog);
      replay = r.failedAt === null ? "再生できる" : `${r.failedAt} 手目で止まる`;
    }
    const who = g.winner === "human" ? "人の勝ち" : g.winner === "cpu" ? "CPU の勝ち" : "途中でやめた";
    console.log(
      `${g.createdAt.slice(0, 16)}  ${g.humanDeck} vs ${g.cpuDeck}  ${who}  ${g.turns} ターン  ${rec.moves.length} 手  ${replay}`,
    );
    if (g.winner) {
      const k = `CPU ${g.cpuDeck} / 人 ${g.humanDeck}`;
      const v = byDeck.get(k) ?? { cpu: 0, human: 0 };
      v[g.winner] += 1;
      byDeck.set(k, v);
    }
  }
  console.log("\nデッキの組み合わせごとの勝ち負け（途中でやめたものは除く）");
  for (const [k, v] of byDeck) console.log(`  ${k}：CPU ${v.cpu} 勝・人 ${v.human} 勝`);
}

const cmd = process.argv[2];
if (cmd === "fetch") await fetchAll();
else if (cmd === "summary") summary();
else console.log("使い方：pnpm logs:cpu fetch | summary");
