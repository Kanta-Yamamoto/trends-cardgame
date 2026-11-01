import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { POOL } from "./db/db.module";
import { MatchesGateway } from "./matches/matches.gateway";

/**
 * これより古い iOS アプリには、更新をお願いする画面だけを出す（11月1日）。
 * サーバーやカードの変更で古いアプリが動かなくなるときに上げる。アプリの版は web の native.ts の APP_VERSION
 */
export const MIN_APP_VERSION = 1;

@Controller("health")
export class HealthController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    private readonly matches: MatchesGateway,
  ) {}

  /**
   * 死活の確認。liveMatches はいま対戦中の数（0 になるまでデプロイを待つのに使う）。
   * minAppVersion・appStoreId は、アプリが更新のお願いを出すかを決めるのに使う
   */
  @Get()
  async check() {
    await this.pool.query("SELECT 1");
    return {
      status: "ok",
      liveMatches: this.matches.liveMatches(),
      minAppVersion: MIN_APP_VERSION,
      appStoreId: process.env.APPLE_APP_ID || null,
    };
  }
}
