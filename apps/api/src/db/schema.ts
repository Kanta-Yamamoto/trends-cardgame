import type { CardEffect, DarkSide } from "@trends/cards";
import type { Clock, CpuGameRecord, GameState } from "@trends/game-core";
import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** カードの定義。元データは packages/cards/src/cards.json で、seed で取り込む */
export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  epithet: text("epithet").notNull(),
  /** icon（キャラクター）か post（呪文） */
  type: text("type").notNull().default("icon"),
  /** ★の数（1〜5） */
  rarity: integer("rarity").notNull().default(1),
  cost: integer("cost").notNull(),
  // 呪文は攻撃力・体力を持たない
  attack: integer("attack"),
  hp: integer("hp"),
  attributes: text("attributes").array().notNull().default([]),
  kaiwai: text("kaiwai").array().notNull().default([]),
  keywords: text("keywords").array().notNull().default([]),
  /** ルールで使う効果（packages/cards の CardEffect） */
  effects: jsonb("effects").$type<CardEffect[]>().notNull().default([]),
  /** 呪文の対象 */
  target: text("target"),
  /** 呪文の対象を、自分のその界隈だけに限る */
  targetKaiwai: text("target_kaiwai"),
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

/** ユーザー。sub は google:（Web の Google ログイン）・device:（アプリの端末）・dev:（開発用）で始まる */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** アカウントごとに変わらない ID */
  sub: text("sub").notNull().unique(),
  /** プレイヤー名（ランキング・対戦の相手の画面に出る）。Google の名前は使わず、本人が決める */
  name: text("name").notNull(),
  /** 本人がプレイヤー名を決めたか（10月27日から。決めるまでは初期登録の画面だけを出す） */
  nameSet: boolean("name_set").notNull().default(false),
  picture: text("picture"),
  /** レーティング（ランダムマッチの勝ち負けで上下する。1500 から） */
  rating: integer("rating").notNull().default(1500),
  /** レーティングが動いた対戦の数と、そのうちの勝ち数 */
  ratedGames: integer("rated_games").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  /** 買い切りを買ったか（11月1日。Web の友だちは買わなくても使える。auth/access.ts） */
  unlocked: boolean("unlocked").notNull().default(false),
  /** 開けられるパックの残りと、それを数えた日（日本の日付。game-core の packsToday） */
  packs: integer("packs").notNull().default(0),
  packsDay: text("packs_day"),
  /** チュートリアルの 1 パックがまだ残っているか */
  tutorialPack: boolean("tutorial_pack").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type UserRow = typeof users.$inferSelect;

/** 対戦の部屋。合言葉（code）で相手が入り、2人そろったら state に対戦の状態を持つ */
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  /** waiting（相手待ち）/ playing / finished / closed（2 人とも抜けたので、決着なしで閉じた） */
  status: text("status").notNull().default("waiting"),
  /** friend（合言葉の部屋）/ random（ランダムマッチ。レーティングが動く）/ cpu（人と組めなかったときの CPU と。レーティングは動かない） */
  kind: text("kind").notNull().default("friend"),
  p1Id: uuid("p1_id")
    .notNull()
    .references(() => users.id),
  p1Deck: text("p1_deck"),
  p2Id: uuid("p2_id").references(() => users.id),
  p2Deck: text("p2_deck"),
  /** game-core の GameState（隠す情報も含む本当の状態。クライアントには stateFor で変えて渡す） */
  state: jsonb("state").$type<GameState>(),
  winnerId: uuid("winner_id").references(() => users.id),
  /** 持ち時間（game-core の Clock）。この仕組みより前に始まった対戦は null（時間の制限なし） */
  clock: jsonb("clock").$type<Clock>(),
  /** 決着でレーティングが動いたときの、両者の前後の値 */
  ratings: jsonb("ratings").$type<MatchRatings>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type MatchRow = typeof matches.$inferSelect;

/** 決着でのレーティングの動き（p1 / p2 の前後の値） */
export type MatchRatings = Record<"p1" | "p2", { before: number; after: number }>;

/** アプリが自分で作って持つ設定（ログインのトークンに署名する鍵など） */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 自分で組んだデッキ（ログインしたユーザーごとに一覧をまるごと持つ。どの端末から入っても同じデッキを使えるように） */
export const userDecks = pgTable("user_decks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** web の CustomDeck の配列（id・name・cards・updated） */
  decks: jsonb("decks").$type<SavedDeck[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** 保存するデッキ1つ分（web の CustomDeck と同じ形） */
export interface SavedDeck {
  id: string;
  name: string;
  cards: string[];
  /** 保存した時刻（ミリ秒） */
  updated: number;
}

/**
 * CPU 対戦の記録（人と CPU の対戦を一手ずつ）。あとで見返して CPU を強くし、カードのバランス調整に使う（docs/cpu-logs.md）。
 * userId は遊んだアカウント（10月26日から。サービス全体でログインが要る。それより前の記録は null）。client は端末ごとの印
 */
export const cpuGames = pgTable("cpu_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  client: text("client").notNull(),
  /** カードのデータの印（game-core の cardsStamp） */
  cards: text("cards").notNull(),
  humanDeck: text("human_deck").notNull(),
  cpuDeck: text("cpu_deck").notNull(),
  /** human（人の勝ち）/ cpu（CPU の勝ち）/ null（途中でやめた） */
  winner: text("winner"),
  turns: integer("turns").notNull(),
  record: jsonb("record").$type<CpuGameRecord>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 持っているカード。アプリでは、自分のデッキに入れられるのは持っているカードだけ（11月1日） */
export const userCards = pgTable(
  "user_cards",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    count: integer("count").notNull().default(0),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

/** 買い切りの購入。App Store の originalTransactionId ごとに 1 行。入れ直したあとの「購入を復元」で元のアカウントに戻す */
export const purchases = pgTable("purchases", {
  originalTransactionId: text("original_transaction_id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  /** Production か Sandbox */
  environment: text("environment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** ガチャを回した記録（出たカード。あとで実際の出方が提供割合どおりかを確かめる） */
export const gachaPulls = pgTable("gacha_pulls", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packs: integer("packs").notNull(),
  /** パックごとの 5 枚の ID */
  cards: jsonb("cards").$type<string[][]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
