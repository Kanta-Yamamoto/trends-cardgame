import type { CardEffect, DarkSide } from "@trends/cards";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** カードの定義。元データは packages/cards/src/cards.json で、seed で取り込む */
export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  epithet: text("epithet").notNull(),
  /** icon（アイコン）か post（投稿） */
  type: text("type").notNull().default("icon"),
  /** ★の数（1〜5） */
  rarity: integer("rarity").notNull().default(1),
  cost: integer("cost").notNull(),
  // 投稿は攻撃力・体力を持たない
  attack: integer("attack"),
  hp: integer("hp"),
  attributes: text("attributes").array().notNull().default([]),
  kaiwai: text("kaiwai").array().notNull().default([]),
  keywords: text("keywords").array().notNull().default([]),
  /** ルールで使う効果（packages/cards の CardEffect） */
  effects: jsonb("effects").$type<CardEffect[]>().notNull().default([]),
  /** 投稿の対象 */
  target: text("target"),
  effect: text("effect").notNull(),
  flavor: text("flavor").notNull(),
  number: text("number"),
  serial: text("serial"),
  // イラストがまだないカードは null
  art: text("art"),
  subject: text("subject"),
  original: text("original"),
  /** 闇堕ちの姿 */
  dark: jsonb("dark").$type<DarkSide>(),
  token: boolean("token").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CardRow = typeof cards.$inferSelect;
