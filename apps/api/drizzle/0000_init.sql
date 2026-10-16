CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"epithet" text NOT NULL,
	"rarity" text NOT NULL,
	"cost" integer NOT NULL,
	"power" integer NOT NULL,
	"tribe" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"effect" text NOT NULL,
	"flavor" text NOT NULL,
	"number" text,
	"serial" text,
	"art" text NOT NULL,
	"subject" text NOT NULL,
	"theme" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
