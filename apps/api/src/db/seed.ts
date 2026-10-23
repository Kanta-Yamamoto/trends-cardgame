import "dotenv/config";
import { notInArray, sql } from "drizzle-orm";
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
  // cards.json から消したカードは、データベースからも消す（カードの表を参照する表は無い）。
  // 取り込むカードが 0 枚のときは、すべてを消してしまわないよう何もしない
  if (rows.length === 0) throw new Error("cards.json にカードがありません");
  const removed = await db
    .delete(cards)
    .where(
      notInArray(
        cards.id,
        rows.map((r) => r.id),
      ),
    )
    .returning({ id: cards.id });
  console.log(`seeded ${rows.length} cards, removed ${removed.length}`);
  await pool.end();
}
main();
