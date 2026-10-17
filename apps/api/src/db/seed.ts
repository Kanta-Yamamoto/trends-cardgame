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
        type: sql`excluded.type`,
        rarity: sql`excluded.rarity`,
        cost: sql`excluded.cost`,
        attack: sql`excluded.attack`,
        hp: sql`excluded.hp`,
        attributes: sql`excluded.attributes`,
        kaiwai: sql`excluded.kaiwai`,
        keywords: sql`excluded.keywords`,
        effects: sql`excluded.effects`,
        target: sql`excluded.target`,
        effect: sql`excluded.effect`,
        flavor: sql`excluded.flavor`,
        number: sql`excluded.number`,
        serial: sql`excluded.serial`,
        art: sql`excluded.art`,
        subject: sql`excluded.subject`,
        original: sql`excluded.original`,
        dark: sql`excluded.dark`,
        token: sql`excluded.token`,
        updatedAt: sql`now()`,
      },
    });
  console.log(`seeded ${rows.length} cards`);
  await pool.end();
}
main();
