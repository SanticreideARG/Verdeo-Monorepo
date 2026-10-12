ALTER TABLE "product_families" ADD COLUMN "abbreviation" text;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "kitchen_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "show_size" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "intuitivo_customer_name" boolean DEFAULT true NOT NULL;