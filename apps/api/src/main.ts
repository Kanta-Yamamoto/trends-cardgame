import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { prepareDb } from "./db/prepare";
import { corsOrigins, protect } from "./security";
import { isApiPath, serveWeb } from "./web";

async function bootstrap() {
  // DB の準備（マイグレーション・カードの取り込み）は待たずに始める。眠っていたサーバーが起きたとき、
  // 眠っている DB（Neon）を起こして準備し終えるまで画面を返さないと、その間ずっと白い画面になるため。
  // 画面（Web）はすぐ返し、API だけ準備が終わるまで待たせる（失敗したら 503。デプロイの Smoke test の /health で分かる）
  const ready = prepareDb();
  ready.catch((e) => console.error("DB の準備に失敗しました", e));
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 公開前の守り（招待リンク・回数の制限・安全のヘッダー）。ほかより先に差し込む
  protect(app);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isApiPath(req.path)) return next();
    ready.then(
      () => next(),
      () => res.status(503).json({ message: "サーバーの準備に失敗しました" }),
    );
  });
  // CPU 対戦の記録（一手ずつ・CPU が考えた中身つき）は 100KB を超えることがあるので、受け取れる大きさを広げる
  app.useBodyParser("json", { limit: "2mb" });
  app.enableCors({ origin: corsOrigins() });
  // 本番ではビルドした Web も同じサーバーで配る
  serveWeb(app);
  // Cloud Run は PORT を渡してくる
  await app.listen(Number(process.env.PORT ?? 3001));
}
bootstrap();
