ALTER TABLE "label_settings" ADD COLUMN "font_family" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "font_scale" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_font_scale_check" CHECK ("label_settings"."font_scale" >= 60 and "label_settings"."font_scale" <= 200);