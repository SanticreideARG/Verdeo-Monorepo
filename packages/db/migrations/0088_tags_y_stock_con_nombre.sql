CREATE TABLE "customer_tags" (
	"customer_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tags_customer_id_tag_id_pk" PRIMARY KEY("customer_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "order_tags" (
	"order_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_tags_order_id_tag_id_pk" PRIMARY KEY("order_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag_sites" (
	"tag_id" uuid NOT NULL,
	"operating_site_id" uuid NOT NULL,
	CONSTRAINT "tag_sites_tag_id_operating_site_id_pk" PRIMARY KEY("tag_id","operating_site_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'green' NOT NULL,
	"applies_to" text DEFAULT 'BOTH' NOT NULL,
	"production_sheet" text DEFAULT 'NAME' NOT NULL,
	"delivery_sheet" text DEFAULT 'NAME' NOT NULL,
	"orders_sheet" text DEFAULT 'NAME' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_check" CHECK (length(trim("tags"."name")) between 1 and 40),
	CONSTRAINT "tags_applies_to_check" CHECK ("tags"."applies_to" in ('CUSTOMER', 'ORDER', 'BOTH')),
	CONSTRAINT "tags_sheet_modes_check" CHECK ("tags"."production_sheet" in ('OFF', 'NAME', 'CHECK') and "tags"."delivery_sheet" in ('OFF', 'NAME', 'CHECK') and "tags"."orders_sheet" in ('OFF', 'NAME', 'CHECK'))
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "name_label" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tags" ADD CONSTRAINT "order_tags_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tags" ADD CONSTRAINT "order_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tags" ADD CONSTRAINT "order_tags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_sites" ADD CONSTRAINT "tag_sites_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_sites" ADD CONSTRAINT "tag_sites_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_tags_tag_idx" ON "customer_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "order_tags_tag_idx" ON "order_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tags" USING btree (lower("name"));--> statement-breakpoint
-- El primer tag, pedido el 2026-11-28: sale en las planillas al final del nombre, en todas las ciudades.
INSERT INTO "tags" ("name", "color", "applies_to") VALUES ('Sin semillas', 'amber', 'BOTH') ON CONFLICT DO NOTHING;
