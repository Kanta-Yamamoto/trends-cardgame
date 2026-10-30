import "dotenv/config";
import { createDb } from "./client";
import { seedCards } from "./prepare";

async function main() {
  const { db, pool } = createDb();
  const { seeded, removed } = await seedCards(db);
  console.log(`seeded ${seeded} cards, removed ${removed}`);
  await pool.end();
}
main();
