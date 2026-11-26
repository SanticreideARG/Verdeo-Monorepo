ALTER TABLE "label_settings" ADD COLUMN "production_weekday" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "production_week_offset" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_production_weekday_check" CHECK ("label_settings"."production_weekday" between 0 and 6);--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_production_week_offset_check" CHECK ("label_settings"."production_week_offset" between -1 and 4);