import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { withPreview } from "./ogp";

/** API の道（これ以外の画面の道は、Web の index.html を返す） */
const API_PREFIXES = ["/cards", "/health", "/auth", "/matches", "/me", "/rankings", "/logs", "/socket.io"];

/**
 * WEB_DIST（Web のビルド結果）があれば、API と同じサーバーで画面も配る。
 * 1つの Cloud Run で済み、同じ場所なので CORS も要らない。
 */
export function serveWeb(app: NestExpressApplication, dir = process.env.WEB_DIST) {
  if (!dir || !existsSync(join(dir, "index.html"))) return false;
  app.useStaticAssets(dir, {
    index: false,
    maxAge: "1h",
    setHeaders: (res, path) => {
      // サービスワーカーと manifest は毎回確かめさせる（更新がすぐ届くように）
      if (path.endsWith("sw.js") || path.endsWith(".webmanifest")) res.setHeader("Cache-Control", "no-cache");
      // ビルドした JS・CSS は名前にハッシュが付くので、ずっと使ってよい
      else if (/[\\/]assets[\\/][^\\/]+-[\w-]{8,}\.(js|css)$/.test(path))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      // カードの絵などの画像は、同じ名前のまま差し替えることがあるので毎回確かめさせる（変わっていなければ 304 で軽い）
      else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(path)) res.setHeader("Cache-Control", "no-cache");
    },
  });
  // 画面は 1 つの index.html（SPA）。リンクのプレビュー（OGP）を差し込んで返す（ogp.ts）
  const index = readFileSync(resolve(dir, "index.html"), "utf8");
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isApi = API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
    if (req.method !== "GET" || isApi || !req.accepts("html")) return next();
    // 招待リンクで開いたときは、守り（security.ts）が保存させない指示を付けている
    if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(withPreview(index, req, res.locals.invited === true));
  });
  return true;
}
