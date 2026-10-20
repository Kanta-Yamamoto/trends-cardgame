// 構築済みデッキの総当たり（先読みする CPU 同士）。ビルド後に動かす：
//   pnpm --filter @trends/game-core build && node packages/game-core/scripts/balance.mjs [各組み合わせの試合数] [並列数]
// 結果はデッキ別の勝率・組み合わせ表・先攻の勝率・平均ターン数を出す。
// 時間ではなく「試す手の数」で探索を打ち切るので、マシンの速さで結果が変わらない。
import { cpus } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { CARDS, DECKS } from "@trends/cards";
import { applyAction, autoSacrifice, createGame, DEFAULT_SEARCH, planTurnSearch } from "@trends/game-core";

// 対戦で使う CPU と同じ探索の広さ（時間の上限だけ外す）
const SEARCH = { ...DEFAULT_SEARCH, timeLimitMs: Number.POSITIVE_INFINITY };
const catalog = Object.fromEntries(CARDS.map((c) => [c.id, c]));
// ライフや初期手札を変えて試すとき：BALANCE_CONFIG='{"startLp":16,"startHand":3}'
const CONFIG = process.env.BALANCE_CONFIG ? JSON.parse(process.env.BALANCE_CONFIG) : undefined;

function play(a, b, seed) {
  const first = seed % 2 === 0 ? "p1" : "p2";
  let s = createGame({
    decks: { p1: DECKS[a], p2: DECKS[b] },
    seed,
    first,
    config: CONFIG,
  });
  let turns = 0;
  const used = { p1: new Set(), p2: new Set() };
  const own = { p1: 0, p2: 0 };
  const oshiTurn = { p1: 0, p2: 0 };
  const darkTurn = { p1: 0, p2: 0 };
  const buzzes = { p1: 0, p2: 0 };
  const record = (r) => {
    for (const e of r.events) {
      if (e.type === "played" || e.type === "cast") used[e.player].add(e.cardId);
      if (e.type === "played" && catalog[e.cardId]?.dark && !oshiTurn[e.player])
        oshiTurn[e.player] = own[e.player];
      if (e.type === "darkFall") darkTurn[e.player] = own[e.player];
      if (e.type === "buzz") buzzes[e.player]++;
    }
  };
  for (; turns < 80 && !s.winner; turns++) {
    // 差し出し待ちから続けるときは、同じターンの続きなので数えない
    if (s.pending) turns--;
    else own[s.active]++;
    // 差し出し待ち（フィクサー）が残っていれば、待っている側が選ぶ（同じターンの続き）
    while (s.pending && !s.winner) {
      const pid = s.pending.waiting[0];
      const r = applyAction(
        s,
        { type: "sacrifice", player: pid, slot: autoSacrifice(s, pid, catalog) },
        catalog,
      );
      s = r.state;
      record(r);
    }
    if (s.winner) break;
    for (const act of planTurnSearch(s, s.active, catalog, SEARCH)) {
      const r = applyAction(s, act, catalog);
      s = r.state;
      record(r);
      if (s.winner) break;
    }
  }
  return {
    winner: s.winner,
    first,
    turns,
    oshiTurn,
    darkTurn,
    buzzes,
    used: { p1: [...used.p1], p2: [...used.p2] },
  };
}

if (!isMainThread) {
  const out = [];
  for (const [a, b, seed] of workerData) {
    const r = play(a, b, seed);
    out.push({ a, b, ...r });
    if (out.length % 10 === 0) parentPort.postMessage({ progress: 10 });
  }
  parentPort.postMessage({ done: out });
} else {
  const games = Number(process.argv[2] ?? 40);
  const workers = Number(process.argv[3] ?? cpus().length);
  const only = process.argv[4]?.split(",");
  const ids = Object.keys(DECKS).filter((d) => !only || only.includes(d));
  const jobs = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (!process.env.BALANCE_FOCUS || [ids[i], ids[j]].includes(process.env.BALANCE_FOCUS))
        for (let g = 0; g < games; g++) jobs.push([ids[i], ids[j], 1000 + g * 7919 + i * 131 + j]);
  const chunks = Array.from({ length: workers }, (_, w) => jobs.filter((_, k) => k % workers === w));
  let doneN = 0;
  const t0 = Date.now();
  const results = (
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise((res, rej) => {
            const w = new Worker(new URL(import.meta.url), { workerData: chunk });
            w.on("message", (m) => {
              if (m.progress) {
                doneN += m.progress;
                if (doneN % 100 === 0)
                  console.error(`${doneN}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
              } else res(m.done);
            });
            w.on("error", rej);
          }),
      ),
    )
  ).flat();

  const win = Object.fromEntries(ids.map((d) => [d, { w: 0, n: 0 }]));
  const vs = {};
  let firstWins = 0;
  let decided = 0;
  let turnSum = 0;
  let draws = 0;
  for (const r of results) {
    turnSum += r.turns;
    if (!r.winner) {
      draws++;
      continue;
    }
    decided++;
    const wd = r.winner === "p1" ? r.a : r.b;
    const ld = r.winner === "p1" ? r.b : r.a;
    win[wd].w++;
    win[wd].n++;
    win[ld].n++;
    vs[`${wd}>${ld}`] = (vs[`${wd}>${ld}`] ?? 0) + 1;
    if (r.winner === r.first) firstWins++;
  }
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(
    `試合数 ${results.length}（決着 ${decided}、決着なし ${draws}）、${((Date.now() - t0) / 1000).toFixed(0)} 秒`,
  );
  console.log(`先攻の勝率 ${pct(firstWins / decided)}、平均 ${(turnSum / results.length).toFixed(1)} ターン`);
  {
    const b = results.reduce((n, r) => n + (r.buzzes?.p1 ?? 0) + (r.buzzes?.p2 ?? 0), 0);
    console.log(`バズ：1人1試合あたり平均 ${(b / (results.length * 2)).toFixed(2)} 回`);
  }
  {
    // 闇堕ちを持つ★5：出した割合・出した自分のターン（平均）と、闇堕ちした割合、デッキ別
    const st = Object.fromEntries(ids.map((d) => [d, { n: 0, o: 0, ot: 0, k: 0, kt: 0, kw: 0 }]));
    for (const r of results)
      for (const [p, d] of [
        ["p1", r.a],
        ["p2", r.b],
      ]) {
        const x = st[d];
        x.n++;
        if (r.oshiTurn[p]) {
          x.o++;
          x.ot += r.oshiTurn[p];
        }
        if (r.darkTurn[p]) {
          x.k++;
          x.kt += r.darkTurn[p];
          if (r.winner === p) x.kw++;
        }
      }
    const all = Object.values(st).reduce((a, x) => ({ n: a.n + x.n, o: a.o + x.o, k: a.k + x.k }), {
      n: 0,
      o: 0,
      k: 0,
    });
    console.log(`闇堕ちを持つ★5を出した ${pct(all.o / all.n)}、闇堕ちした ${pct(all.k / all.n)}`);
    for (const d of ids) {
      const x = st[d];
      console.log(
        `  ${d.padEnd(8)} ★5 ${pct(x.o / x.n)}（平均 ${(x.ot / Math.max(1, x.o)).toFixed(1)} ターン目） 闇堕ち ${pct(x.k / x.n)}（平均 ${(x.kt / Math.max(1, x.k)).toFixed(1)} ターン目、その試合の勝率 ${pct(x.kw / Math.max(1, x.k))}）`,
      );
    }
  }
  console.log("デッキ別の勝率");
  for (const d of [...ids].sort((x, y) => win[y].w / win[y].n - win[x].w / win[x].n))
    console.log(`  ${d.padEnd(8)} ${pct(win[d].w / win[d].n)}  (${win[d].w}/${win[d].n})`);
  console.log(
    `組み合わせ（行が列に勝つ率）\n${"".padEnd(9)}${ids.map((d) => d.slice(0, 7).padStart(8)).join("")}`,
  );
  for (const a of ids)
    console.log(
      a.padEnd(9) +
        ids
          .map((b) => {
            if (a === b) return "—".padStart(8);
            const w = vs[`${a}>${b}`] ?? 0;
            const l = vs[`${b}>${a}`] ?? 0;
            return (w + l ? pct(w / (w + l)) : "-").padStart(8);
          })
          .join(""),
    );
  // カードごと：使った試合の勝率と、そのデッキ全体の勝率との差（大きいほど勝ちに効いている）
  const card = {};
  for (const r of results) {
    if (!r.winner) continue;
    for (const [p, d] of [
      ["p1", r.a],
      ["p2", r.b],
    ]) {
      const deckRate = win[d].w / win[d].n;
      for (const id of r.used[p]) {
        const k = `${d}:${id}`;
        card[k] ??= { w: 0, n: 0, base: deckRate };
        card[k].n++;
        if (r.winner === p) card[k].w++;
      }
    }
  }
  const rows = Object.entries(card)
    .filter(
      ([k, v]) => v.n >= 30 && (!process.env.BALANCE_DECK || k.startsWith(`${process.env.BALANCE_DECK}:`)),
    )
    .map(([k, v]) => ({ k, rate: v.w / v.n, diff: v.w / v.n - v.base, n: v.n }))
    .sort((x, y) => y.diff - x.diff);
  const name = (k) => {
    const id = k.split(":")[1];
    return `${k.padEnd(12)} ${CARDS.find((c) => c.id === id)?.name ?? ""}`;
  };
  const top = Number(process.env.BALANCE_CARDS ?? 12);
  if (top > 0) console.log("勝ちに効いているカード（使った試合の勝率 − デッキの勝率）");
  for (const r of rows.slice(0, top))
    console.log(`  +${Math.round(r.diff * 100)}  ${pct(r.rate)}  n=${r.n}  ${name(r.k)}`);
  if (top > 0) console.log("効いていないカード");
  for (const r of top > 0 ? rows.slice(-top) : [])
    console.log(`  ${Math.round(r.diff * 100)}  ${pct(r.rate)}  n=${r.n}  ${name(r.k)}`);
  if (process.env.BALANCE_JSON)
    (await import("node:fs")).writeFileSync(process.env.BALANCE_JSON, JSON.stringify(results));
}
