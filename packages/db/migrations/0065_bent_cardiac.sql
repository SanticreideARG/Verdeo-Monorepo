ALTER TABLE "label_settings" ADD COLUMN "show_customer_name" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "name_scale" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "name_position" text DEFAULT 'arriba' NOT NULL;