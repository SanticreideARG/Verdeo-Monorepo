CREATE SEQUENCE "public"."order_public_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "customer_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value_normalized" text NOT NULL,
	"value_display" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_dietary_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"dish_name_snapshot" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"offering_id" uuid,
	"product_variant_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"variant_snapshot" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"surcharge_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity_units" > 0),
	CONSTRAINT "order_items_money_check" CHECK ("order_items"."unit_price_minor" >= 0 and "order_items"."discount_minor" >= 0 and "order_items"."surcharge_minor" >= 0 and "order_items"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_number" text DEFAULT 'N' || lpad(nextval('order_public_number_seq')::text, 5, '0') NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"weekly_menu_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"source" text NOT NULL,
	"delivery_date" date NOT NULL,
	"delivery_address_snapshot" text NOT NULL,
	"payment_expectation" text NOT NULL,
	"notes" text,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"total_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_number_unique" UNIQUE("public_number"),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"meals_per_unit" integer DEFAULT 5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_meals_positive_check" CHECK ("product_variants"."meals_per_unit" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" text NOT NULL,
	"open_at" timestamp with time zone NOT NULL,
	"partial_kitchen_cutoff_at" timestamp with time zone NOT NULL,
	"close_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_cycles_alias_unique" UNIQUE("alias"),
	CONSTRAINT "sales_cycles_cutoff_order_check" CHECK ("sales_cycles"."open_at" < "sales_cycles"."partial_kitchen_cutoff_at" and "sales_cycles"."partial_kitchen_cutoff_at" < "sales_cycles"."close_at")
);
--> statement-breakpoint
CREATE TABLE "weekly_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"dish_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_menu_items_slot_check" CHECK ("weekly_menu_items"."slot" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "weekly_menu_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_menu_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_menu_offerings_price_check" CHECK ("weekly_menu_offerings"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_dietary_instructions" ADD CONSTRAINT "order_dietary_instructions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD CONSTRAINT "order_item_selections_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offering_id_weekly_menu_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."weekly_menu_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menu_items" ADD CONSTRAINT "weekly_menu_items_offering_id_weekly_menu_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."weekly_menu_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menu_offerings" ADD CONSTRAINT "weekly_menu_offerings_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menu_offerings" ADD CONSTRAINT "weekly_menu_offerings_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD CONSTRAINT "weekly_menus_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_active_value_unique" ON "customer_identities" USING btree ("type","value_normalized") WHERE "customer_identities"."active" = true;--> statement-breakpoint
CREATE INDEX "customer_identities_customer_idx" ON "customer_identities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_display_name_idx" ON "customers" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_selections_item_slot_unique" ON "order_item_selections" USING btree ("order_item_id","slot");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_cycle_status_idx" ON "orders" USING btree ("sales_cycle_id","status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_family_code_unique" ON "product_variants" USING btree ("product_family_id","code");--> statement-breakpoint
CREATE INDEX "sales_cycles_status_idx" ON "sales_cycles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menu_items_offering_slot_unique" ON "weekly_menu_items" USING btree ("offering_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menu_offerings_menu_variant_unique" ON "weekly_menu_offerings" USING btree ("weekly_menu_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menus_cycle_revision_unique" ON "weekly_menus" USING btree ("sales_cycle_id","revision");--> statement-breakpoint
CREATE INDEX "weekly_menus_status_idx" ON "weekly_menus" USING btree ("status");