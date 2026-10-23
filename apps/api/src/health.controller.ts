import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { POOL } from "./db/db.module";
import { MatchesGateway } from "./matches/matches.gateway";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    private readonly matches: MatchesGateway,
  ) {}

  /** 死活の確認。liveMatches はいま対戦中の数（0 になるまでデプロイを待つのに使う） */
  @Get()
  async check() {
    await this.pool.query("SELECT 1");
    return { status: "ok", liveMatches: this.matches.liveMatches() };
  }
}
