import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";
import { createDb } from "./client";

export const DB = Symbol("DB");
export const POOL = Symbol("POOL");

const conn = { db: null as ReturnType<typeof createDb>["db"] | null, pool: null as Pool | null };

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: () => {
        const c = createDb();
        conn.db = c.db;
        conn.pool = c.pool;
        return c.pool;
      },
    },
    { provide: DB, inject: [POOL], useFactory: () => conn.db },
  ],
  exports: [DB, POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
