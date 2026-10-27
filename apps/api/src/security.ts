import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { OGP_IMAGE } from "./ogp";

/**
 * 公開前の守り（新しいライブラリは使わない）。main.ts で、画面を配る前・API の前に差し込む。
 *
 * 1. 招待リンク：INVITE_CODE（Secret Manager の invite-code）が入っているときだけ効く。
 *    `?invite=合言葉` 付きの URL で一度開くと、その端末に「招待済み」のクッキー（合言葉のハッシュ）を置き、
 *    そのまま画面を返す（URL の合言葉は画面が消す。invite.ts）。リンクのプレビュー（OGP）を取りに来るロボットは
 *    クッキーを持ち越さないので、開き直させずに、その返事でプレビューを読めるようにしている（ogp.ts）。
 *    クッキーの無い人には「準備中」の画面だけを出し、API・オンライン対戦も断る。
 *    合言葉を変えると、前のリンクと前のクッキーはまとめて使えなくなる。
 * 2. 回数の制限：同じ IP からの呼び出しを1台のメモリで数える（Cloud Run は1台なので、これで足りる）
 * 3. 安全のための応答ヘッダーと、検索エンジンに載せない指示（noindex・robots.txt）
 */

export const INVITE_COOKIE = "trends_invite";
const YEAR_S = 365 * 24 * 60 * 60;

/**
 * 招待なしでも通す道（死活の確認・robots.txt・ログインの設定は、デプロイの確認に使う。
 * プレビューの絵は、リンクのプレビューを作るロボットが招待なしで取りに来る）
 */
const OPEN_PATHS = ["/health", "/robots.txt", "/auth/config", OGP_IMAGE];

const inviteCode = () => process.env.INVITE_CODE?.trim() ?? "";
/** 招待リンクの守りが効いているか */
export const inviteRequired = () => inviteCode() !== "";
/**
 * 招待済みの人に渡す合言葉（GET /auth/invite。友だちを誘うリンク・対戦の部屋のリンクに付ける）。
 * 招待されていない人は、守りがここまで通さない
 */
export const inviteForClient = () => ({ invite: inviteRequired() ? inviteCode() : null });

const digest = (code: string) => createHash("sha256").update(`trends-invite:${code}`).digest("base64url");

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** この接続が招待済みか（守りが効いていないときは、いつも招待済み）。Socket.IO の接続でも使う */
export function isInvited(req: IncomingMessage): boolean {
  const code = inviteCode();
  if (!code) return true;
  const got = readCookie(req.headers.cookie, INVITE_COOKIE);
  return !!got && sameText(got, digest(code));
}

/** 本当の接続元の IP。Cloud Run は X-Forwarded-For の最後に足すので、最後を使う（前の方は相手が自由に書ける） */
export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const list = (Array.isArray(fwd) ? fwd.join(",") : (fwd ?? "")).split(",").map((s) => s.trim());
  return list.filter(Boolean).at(-1) ?? req.socket.remoteAddress ?? "?";
}

/** 決まった時間の枠ごとに数える、簡単な回数の制限 */
export class RateLimiter {
  private hits = new Map<string, { n: number; until: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 1回数える。超えていたら、あと何秒待てばよいかを返す（超えていなければ 0） */
  take(key: string): number {
    const t = this.now();
    if (this.hits.size > 20_000) this.sweep(t);
    const h = this.hits.get(key);
    if (!h || h.until <= t) {
      this.hits.set(key, { n: 1, until: t + this.windowMs });
      return 0;
    }
    h.n += 1;
    return h.n > this.limit ? Math.ceil((h.until - t) / 1000) : 0;
  }

  /** 数えずに、もう超えているかだけを見る */
  blocked(key: string): boolean {
    const h = this.hits.get(key);
    return !!h && h.until > this.now() && h.n >= this.limit;
  }

  private sweep(t: number) {
    for (const [k, h] of this.hits) if (h.until <= t) this.hits.delete(k);
  }
}

export interface Limits {
  /** すべての呼び出し（画面・絵・API） */
  all: RateLimiter;
  /** 書き込み（GET 以外の API） */
  write: RateLimiter;
  /** 合言葉の間違い（総当たりを止める） */
  invite: RateLimiter;
}

export const defaultLimits = (): Limits => ({
  // カード一覧は絵だけで 100 近く読むので、全体は多めにとる
  all: new RateLimiter(1200, 60_000),
  write: new RateLimiter(60, 60_000),
  invite: new RateLimiter(10, 10 * 60_000),
});

const API_PREFIXES = ["/cards", "/health", "/auth", "/matches", "/me", "/rankings", "/logs", "/socket.io"];
const isApiPath = (path: string) => API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * リンクのプレビュー（OGP）を作るロボット。X などは robots.txt を守り、断られるとプレビューを出さないので、
 * これだけは通す（検索エンジンは今までどおり全部お断り）
 */
const PREVIEW_BOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "Line",
  "Discordbot",
  "Slackbot",
  "TelegramBot",
  "WhatsApp",
];
export const ROBOTS = `${PREVIEW_BOTS.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\nUser-agent: *\nDisallow: /\n`;

/** 招待されていない人に出す画面（外の物は読まない。サービスワーカーが保存しないよう 403 で返す） */
export const GATE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="theme-color" content="#0b0b10" />
<title>TRENDS（準備中）</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: #0b0b10; color: #f2f1ee;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; text-align: center; padding: 0 16px; }
  h1 { font: 900 44px/1 "Arial Black", system-ui, sans-serif; letter-spacing: 0.08em; margin: 0 0 18px; }
  p { margin: 6px 0; font-size: 15px; line-height: 1.7; color: #c9c7d2; }
  form { margin-top: 32px; display: grid; gap: 10px; justify-items: center; }
  .small { font-size: 12px; color: #8d8a99; max-width: 300px; }
  input { width: min(280px, 100%); box-sizing: border-box; padding: 10px 12px; font-size: 16px;
    border-radius: 10px; border: 1px solid #3a3946; background: #16161d; color: #f2f1ee; }
  button { padding: 10px 28px; font-size: 15px; font-weight: 700; border: 0; border-radius: 999px;
    background: #f2f1ee; color: #0b0b10; }
</style>
</head>
<body>
<main>
  <h1>TRENDS</h1>
  <p>ただいま準備中です。</p>
  <p>招待リンクをもらった方は、そのリンクから開いてください。</p>
  <form method="get" action="/">
    <p class="small">ホーム画面に追加したアプリで開いている方は、招待リンクの「invite=」のあとの文字を入れてください</p>
    <input name="invite" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="合言葉" required />
    <button type="submit">開く</button>
  </form>
</main>
</body>
</html>
`;

function isHttps(req: Request) {
  return req.secure || String(req.headers["x-forwarded-proto"] ?? "").startsWith("https");
}

function securityHeaders(req: Request, res: Response) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  // 中身の読み込み先は絞らない（演出・フォント・Google ログインを壊さないため）。よそのページへの埋め込みと <base> の差し替えだけ止める
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  // Google ログインのポップアップは使えるように
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function tooMany(res: Response, wait: number) {
  res.setHeader("Retry-After", String(wait));
  res
    .status(429)
    .json({ statusCode: 429, message: "アクセスが多すぎます。少し待ってからやり直してください" });
}

/** 守りを差し込む。ほかの app.use・画面の配信より前に呼ぶ */
export function protect(app: NestExpressApplication, limits: Limits = defaultLimits()) {
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  app.use((req: Request, res: Response, next: NextFunction) => {
    securityHeaders(req, res);
    const ip = clientIp(req);

    const wait = limits.all.take(ip);
    if (wait) return tooMany(res, wait);
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && isApiPath(req.path)) {
      const w = limits.write.take(ip);
      if (w) return tooMany(res, w);
    }

    if (req.path === "/robots.txt") {
      res.type("text/plain").setHeader("Cache-Control", "public, max-age=86400");
      return res.send(ROBOTS);
    }

    // 合言葉付きで開いた：合っていれば招待済みのクッキーを置き、そのまま通す
    // （開き直させると、クッキーを持ち越さないプレビューのロボットが「準備中」を読んでしまう）
    const given = typeof req.query.invite === "string" ? req.query.invite.trim() : "";
    if (given && inviteRequired() && req.method === "GET") {
      if (limits.invite.blocked(ip)) return tooMany(res, Math.ceil(limits.invite.windowMs / 1000));
      if (sameText(digest(given), digest(inviteCode()))) {
        const secure = isHttps(req) ? "; Secure" : "";
        res.setHeader(
          "Set-Cookie",
          `${INVITE_COOKIE}=${digest(inviteCode())}; Path=/; Max-Age=${YEAR_S}; HttpOnly; SameSite=Lax${secure}`,
        );
        res.setHeader("Cache-Control", "no-store");
        // 画面を配るところ（web.ts）が、招待のプレビューを付ける
        res.locals.invited = true;
        return next();
      }
      limits.invite.take(ip);
    }

    if (isInvited(req) || OPEN_PATHS.includes(req.path)) return next();

    // 招待されていない
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && !isApiPath(req.path) && req.accepts("html")) {
      return res.status(403).type("html").send(GATE_HTML);
    }
    return res.status(403).json({ statusCode: 403, message: "招待リンクから開いてください" });
  });
}
