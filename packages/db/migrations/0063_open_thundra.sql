CREATE TABLE "feed_card_states" (
	"user_id" uuid NOT NULL,
	"card_key" text NOT NULL,
	"hidden_until" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_card_states_user_id_card_key_pk" PRIMARY KEY("user_id","card_key"),
	CONSTRAINT "feed_card_states_key_check" CHECK (length("feed_card_states"."card_key") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "feed_post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_post_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_replies_body_check" CHECK (length("feed_post_replies"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "feed_card_states" ADD CONSTRAINT "feed_card_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_replies" ADD CONSTRAINT "feed_post_replies_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_replies" ADD CONSTRAINT "feed_post_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_post_replies_post_idx" ON "feed_post_replies" USING btree ("post_id","created_at");