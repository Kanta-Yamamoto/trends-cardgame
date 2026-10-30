import "dotenv/config";
import { createDb } from "./client";
import { migrateDb } from "./prepare";

/** drizzle/ のマイグレーションを適用する（手元・CI で実行。本番はサーバーの起動のたびに main.ts が行う） */
async function main() {
  const { db, pool } = createDb();
  await migrateDb(db);
  console.log("migrated");
  await pool.end();
}
main();
