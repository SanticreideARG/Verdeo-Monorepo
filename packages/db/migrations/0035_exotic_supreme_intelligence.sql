CREATE TABLE "calendar_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"remind_on" date NOT NULL,
	"scope" text NOT NULL,
	"operating_site_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_reminders_scope_check" CHECK ("calendar_reminders"."scope" in ('personal', 'general'))
);
--> statement-breakpoint
ALTER TABLE "calendar_reminders" ADD CONSTRAINT "calendar_reminders_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_reminders" ADD CONSTRAINT "calendar_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_reminders_date_idx" ON "calendar_reminders" USING btree ("remind_on");--> statement-breakpoint
CREATE INDEX "calendar_reminders_author_idx" ON "calendar_reminders" USING btree ("created_by_user_id","remind_on");