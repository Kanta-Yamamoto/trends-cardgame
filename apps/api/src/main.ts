import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { serveWeb } from "./web";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true });
  // 本番ではビルドした Web も同じサーバーで配る
  serveWeb(app);
  // Cloud Run は PORT を渡してくる
  await app.listen(Number(process.env.PORT ?? 3001));
}
bootstrap();
