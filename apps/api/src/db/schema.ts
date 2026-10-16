import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** カードの定義。元データは packages/cards/src/cards.json で、seed で取り込む */
export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  epithet: text("epithet").notNull(),
  rarity: text("rarity").notNull(),
  cost: integer("cost").notNull(),
  attack: integer("attack").notNull().default(0),
  hp: integer("hp").notNull().default(0),
  tribe: text("tribe").notNull(),
  keywords: text("keywords").array().notNull().default([]),
  effect: text("effect").notNull(),
  flavor: text("flavor").notNull(),
  number: text("number"),
  serial: text("serial"),
  // イラストがまだないカードは null
  art: text("art"),
  subject: text("subject"),
  theme: text("theme").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CardRow = typeof cards.$inferSelect;
