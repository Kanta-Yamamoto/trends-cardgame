import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { cards } from "./schema";
import { cardRows } from "./seed-data";

async function main() {
  const { db, pool } = createDb();
  const rows = cardRows();
  await db
    .insert(cards)
    .values(rows)
    .onConflictDoUpdate({
      target: cards.id,
      set: {
        name: sql`excluded.name`,
        epithet: sql`excluded.epithet`,
        rarity: sql`excluded.rarity`,
        cost: sql`excluded.cost`,
        attack: sql`excluded.attack`,
        hp: sql`excluded.hp`,
        tribe: sql`excluded.tribe`,
        keywords: sql`excluded.keywords`,
        effect: sql`excluded.effect`,
        flavor: sql`excluded.flavor`,
        number: sql`excluded.number`,
        serial: sql`excluded.serial`,
        art: sql`excluded.art`,
        subject: sql`excluded.subject`,
        theme: sql`excluded.theme`,
        updatedAt: sql`now()`,
      },
    });
  console.log(`seeded ${rows.length} cards`);
  await pool.end();
}
main();
