import { notInArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, type Db } from "./client";
import { cards } from "./schema";
import { cardRows } from "./seed-data";

/** drizzle/ のマイグレーションを適用する（何度やっても同じ結果） */
export async function migrateDb(db: Db) {
  await migrate(db, { migrationsFolder: "drizzle" });
}

/** カードのデータ（cards.json）を DB に入れる。cards.json から消したカードは DB からも消す。消した数を返す */
export async function seedCards(db: Db): Promise<{ seeded: number; removed: number }> {
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
  return { seeded: rows.length, removed: removed.length };
}

/**
 * サーバーの起動のたびに、マイグレーションとカードの取り込みを済ませる（1 つのプロセスの中で。node を何度も起こさない）。
 * 画面（Web）は待たずに返し、API はこれが終わるまで待たせる（main.ts）
 */
export async function prepareDb() {
  const { db, pool } = createDb();
  try {
    await migrateDb(db);
    const { seeded, removed } = await seedCards(db);
    console.log(`migrated, seeded ${seeded} cards, removed ${removed}`);
  } finally {
    await pool.end();
  }
}
