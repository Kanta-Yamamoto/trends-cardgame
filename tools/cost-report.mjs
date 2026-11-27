// GCP の利用料金を毎日報告する（.github/workflows/cost-report.yml から動かす）。
// 1. 請求の明細の書き出し（BigQuery の billing_export）があれば、本当の金額（クレジットを引いたあと）を出す
// 2. まだ無ければ、Cloud Run の課金の対象だった時間から見積もる（無料枠を引く前の値）
// 結果は GitHub の Issue「GCP の利用料金（毎日の報告）」にコメントし、Actions の Summary にも出す。
//
// 要る環境変数：GCP_PROJECT_ID、GITHUB_TOKEN・GITHUB_REPOSITORY（Actions が入れる）。
// GCP には gcloud でログインしてある前提（アクセストークンを gcloud から取る）
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const PROJECT = process.env.GCP_PROJECT_ID ?? "trends-cardgame";
const SERVICE = "trends-api";
const DATASET = "billing_export";
const ISSUE_TITLE = "GCP の利用料金（毎日の報告）";
const OWNER_LOGIN = "Kanta-Yamamoto";

// 見積もりに使う値（Cloud Run・リクエストに応じた課金・Tier 1（東京）。2026年11月の料金表）
const CPU = 1; // vCPU（infra/terraform/main.tf の limits）
const MEM_GIB = 0.5; // 512Mi
const ACTIVE_USD_PER_S = CPU * 0.000024 + MEM_GIB * 0.0000025;
const IDLE_USD_PER_S = CPU * 0.0000025 + MEM_GIB * 0.0000025; // 待機の台数（min instances）が何もしていない間
const JPY_PER_USD = 155; // 見積もりだけに使う、おおよその為替

const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();

async function gcp(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${url}\n${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

// 日本の日付で「きのう」と「今月の 1 日」
const jstToday = new Date(Date.now() + 9 * 3600_000);
const day = new Date(jstToday);
day.setUTCDate(day.getUTCDate() - 1);
const ymd = (d) => d.toISOString().slice(0, 10);
const DAY = ymd(day);
const FIRST = `${DAY.slice(0, 7)}-01`;
const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const money = (n, cur) => (cur === "JPY" ? yen(n) : `${n.toFixed(2)} ${cur}`);

async function billingTable() {
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/datasets/${DATASET}/tables`;
  const list = await gcp(base).catch(() => ({}));
  return (list.tables ?? [])
    .map((t) => t.tableReference.tableId)
    .find((id) => id.startsWith("gcp_billing_export_v1_"));
}

async function fromBilling(table) {
  const net = "cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)";
  const query = `
    SELECT service.description AS service, currency,
      SUM(IF(DATE(usage_start_time, "Asia/Tokyo") = DATE "${DAY}", ${net}, 0)) AS day_total,
      SUM(${net}) AS month_total
    FROM \`${PROJECT}.${DATASET}.${table}\`
    WHERE DATE(usage_start_time, "Asia/Tokyo") BETWEEN DATE "${FIRST}" AND DATE "${DAY}"
      AND project.id = "${PROJECT}"
    GROUP BY service, currency
    ORDER BY month_total DESC`;
  const res = await gcp(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: "POST",
    body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 60_000 }),
  });
  const rows = (res.rows ?? []).map((r) => ({
    service: r.f[0].v,
    currency: r.f[1].v,
    day: Number(r.f[2].v),
    month: Number(r.f[3].v),
  }));
  const cur = rows[0]?.currency ?? "JPY";
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const lines = [
    `**${DAY}（きのう）：${money(sum("day"), cur)}** ／ 今月（${FIRST.slice(5).replace("-", "月")}日〜）：${money(sum("month"), cur)}`,
    "",
    "| サービス | きのう | 今月 |",
    "|---|---:|---:|",
    ...rows
      .filter((r) => Math.abs(r.month) >= 0.5)
      .map((r) => `| ${r.service} | ${money(r.day, cur)} | ${money(r.month, cur)} |`),
    "",
    "請求の明細（BigQuery）から。クレジット（無料枠など）を引いたあとの金額。明細は届くまで最大 1 日ほど遅れるので、きのうの分は少なめに出ることがある。",
  ];
  return lines.join("\n");
}

async function cloudRunSum(metric, endIso, seconds) {
  const start = new Date(Date.parse(endIso) - seconds * 1000).toISOString();
  const q = new URLSearchParams({
    filter: `metric.type = "run.googleapis.com/${metric}" AND resource.labels.service_name = "${SERVICE}"`,
    "interval.startTime": start,
    "interval.endTime": endIso,
    "aggregation.alignmentPeriod": `${seconds}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const res = await gcp(`https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${q}`);
  let total = 0;
  for (const ts of res.timeSeries ?? [])
    for (const p of ts.points ?? []) total += Number(p.value.doubleValue ?? p.value.int64Value ?? 0);
  return total;
}

async function fromMonitoring() {
  // きのう（日本時間の 0 時〜24 時）
  const end = new Date(`${ymd(jstToday)}T00:00:00+09:00`).toISOString();
  const billable = await cloudRunSum("container/billable_instance_time", end, 86_400);
  const requests = await cloudRunSum("request_count", end, 86_400);
  const low = billable * IDLE_USD_PER_S * JPY_PER_USD;
  const high = billable * ACTIVE_USD_PER_S * JPY_PER_USD;
  return [
    `**${DAY}（きのう）の Cloud Run の見積もり：${yen(low)}〜${yen(high)}**`,
    "",
    `- 課金の対象だった時間：${(billable / 3600).toFixed(1)} 時間（待機の 1 台を含む）`,
    `- リクエスト：${Math.round(requests).toLocaleString("ja-JP")} 回`,
    "",
    `見積もり：ずっと待機していたなら下の値、ずっと動いていたなら上の値（1 vCPU・512MiB、1 ドル ${JPY_PER_USD} 円、無料枠を引く前）。Cloud Run 以外（イメージ置き場など）は入っていない。`,
    "本当の金額にするには、オーナーがコンソールで一度だけ「お支払い」→「課金データのエクスポート」→「BigQuery エクスポート」→「標準の使用料金」で、プロジェクト trends-cardgame のデータセット billing_export を選ぶ。",
  ].join("\n");
}

async function github(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function post(body) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);
  if (!process.env.GITHUB_TOKEN) {
    console.log(body);
    return;
  }
  const open = await github("/issues?state=open&per_page=100");
  let issue = open.find((i) => i.title === ISSUE_TITLE && !i.pull_request);
  if (!issue) {
    // 本文で名前を呼ぶと、オーナーがこの Issue を購読し、毎日のコメントが通知で届く
    issue = await github("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: ISSUE_TITLE,
        body: `@${OWNER_LOGIN} 毎朝 9 時ごろ、きのうの GCP の利用料金をここにコメントします（.github/workflows/cost-report.yml）。止めるときは、この Issue を閉じずに、ワークフローを無効にしてください。`,
      }),
    });
  }
  await github(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  console.log(`報告しました：${issue.html_url}`);
}

const table = await billingTable();
const report = table ? await fromBilling(table) : await fromMonitoring();
await post(report);
