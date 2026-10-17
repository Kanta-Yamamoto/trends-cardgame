import type { CardEffect, DarkSide } from "@trends/cards";
import type { GameState } from "@trends/game-core";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

/** ログインしたユーザー（Google のアカウント。開発用ログインは sub が dev: で始まる） */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Google の sub（アカウントごとに変わらない ID） */
  sub: text("sub").notNull().unique(),
  name: text("name").notNull(),
  picture: text("picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type UserRow = typeof users.$inferSelect;

/** 対戦の部屋。合言葉（code）で相手が入り、2人そろったら state に対戦の状態を持つ */
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  /** waiting（相手待ち）/ playing / finished */
  status: text("status").notNull().default("waiting"),
  p1Id: uuid("p1_id")
    .notNull()
    .references(() => users.id),
  p1Deck: text("p1_deck").notNull(),
  p2Id: uuid("p2_id").references(() => users.id),
  p2Deck: text("p2_deck"),
  /** game-core の GameState（隠す情報も含む本当の状態。クライアントには stateFor で変えて渡す） */
  state: jsonb("state").$type<GameState>(),
  winnerId: uuid("winner_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type MatchRow = typeof matches.$inferSelect;
