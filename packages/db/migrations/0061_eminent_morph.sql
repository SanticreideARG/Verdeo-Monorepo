CREATE TABLE "production_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"family_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"notes" text,
	"actor_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_stock_quantity_positive_check" CHECK ("production_stock"."quantity_units" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_stock" ADD CONSTRAINT "production_stock_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock" ADD CONSTRAINT "production_stock_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_stock_cycle_variant_unique" ON "production_stock" USING btree ("sales_cycle_id","family_name","variant_name");