ALTER TABLE "label_settings" ADD COLUMN "sheet_width_mm" integer DEFAULT 210 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "sheet_height_mm" integer DEFAULT 297 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "sheet_margin_mm" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "label_gap_mm" integer DEFAULT 4 NOT NULL;