DROP INDEX "production_stock_cycle_variant_unique";--> statement-breakpoint
ALTER TABLE "production_stock" ADD COLUMN "origin" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_stock" ADD COLUMN "from_sales_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "production_stock" ADD CONSTRAINT "production_stock_from_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("from_sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_stock_cycle_origin_variant_unique" ON "production_stock" USING btree ("sales_cycle_id","origin","family_name","variant_name");--> statement-breakpoint
ALTER TABLE "production_stock" ADD CONSTRAINT "production_stock_origin_check" CHECK ("production_stock"."origin" in ('planned', 'carry_over'));