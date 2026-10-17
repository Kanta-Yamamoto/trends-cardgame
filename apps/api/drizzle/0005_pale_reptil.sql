ALTER TABLE "cards" ALTER COLUMN "attack" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "attack" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "hp" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "hp" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "type" text DEFAULT 'icon' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "rarity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "attributes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "kaiwai" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "effects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "target" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "original" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "dark" jsonb;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "token" boolean DEFAULT false NOT NULL;