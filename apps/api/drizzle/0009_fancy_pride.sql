CREATE TABLE "user_decks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"decks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_decks" ADD CONSTRAINT "user_decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;