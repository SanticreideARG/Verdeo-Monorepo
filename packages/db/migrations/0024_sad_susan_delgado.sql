CREATE TABLE "label_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"labels_per_page" integer DEFAULT 8 NOT NULL,
	"background_image_url" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "label_settings_labels_per_page_check" CHECK ("label_settings"."labels_per_page" >= 4 and "label_settings"."labels_per_page" <= 12)
);
--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;