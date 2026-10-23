ALTER TABLE "matches" ADD COLUMN "kind" text DEFAULT 'friend' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "clock" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "ratings" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rating" integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rated_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;