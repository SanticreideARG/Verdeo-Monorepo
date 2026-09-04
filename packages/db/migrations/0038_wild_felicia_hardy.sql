CREATE TABLE "user_appearance" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" text,
	"font_key" text,
	"text_scale" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_appearance" ADD CONSTRAINT "user_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;