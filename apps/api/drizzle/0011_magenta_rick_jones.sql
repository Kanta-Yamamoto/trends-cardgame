CREATE TABLE "cpu_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client" text NOT NULL,
	"cards" text NOT NULL,
	"human_deck" text NOT NULL,
	"cpu_deck" text NOT NULL,
	"winner" text,
	"turns" integer NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
