import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { POOL } from "./db/db.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async check() {
    await this.pool.query("SELECT 1");
    return { status: "ok" };
  }
}
