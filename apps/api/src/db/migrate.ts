import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

/** drizzle/ のマイグレーションを適用する（CI・デプロイ時に実行） */
async function main() {
  const { db, pool } = createDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("migrated");
  await pool.end();
}
main();
