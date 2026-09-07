ALTER TABLE "label_settings" ADD COLUMN "fields" text DEFAULT 'tamano,numero' NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "alignment" text DEFAULT 'center' NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "uppercase_name" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "show_borders" boolean DEFAULT true NOT NULL;