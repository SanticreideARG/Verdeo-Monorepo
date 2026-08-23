CREATE TABLE "delivery_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_routes_status_check" CHECK ("delivery_routes"."status" in ('draft', 'published', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "delivery_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"assigned_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_stops_status_check" CHECK ("delivery_stops"."status" in ('pending', 'en_route', 'at_address', 'delivered', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "cash_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"method" text NOT NULL,
	"collected_by_user_id" uuid NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_collections_amount_check" CHECK ("cash_collections"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"settled_by_user_id" uuid NOT NULL,
	"received_by_user_id" uuid NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_settlements_amount_check" CHECK ("cash_settlements"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expected_method" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('PENDING', 'TO_SETTLE', 'PAID')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "operating_sites" ADD COLUMN "origin_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "operating_sites" ADD COLUMN "origin_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_stops" ADD CONSTRAINT "delivery_stops_route_id_delivery_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."delivery_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_stops" ADD CONSTRAINT "delivery_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_stops" ADD CONSTRAINT "delivery_stops_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_collected_by_user_id_users_id_fk" FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_collection_id_cash_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cash_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_settled_by_user_id_users_id_fk" FOREIGN KEY ("settled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_routes_site_date_idx" ON "delivery_routes" USING btree ("operating_site_id","delivery_date");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_stops_route_order_unique" ON "delivery_stops" USING btree ("route_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_stops_route_sequence_unique" ON "delivery_stops" USING btree ("route_id","sequence");--> statement-breakpoint
CREATE INDEX "delivery_stops_assigned_idx" ON "delivery_stops" USING btree ("assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_stops_order_idx" ON "delivery_stops" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_settlements_collection_unique" ON "cash_settlements" USING btree ("collection_id");--> statement-breakpoint
ALTER TABLE "operating_sites" ADD CONSTRAINT "operating_sites_origin_coordinates_check" CHECK (("operating_sites"."origin_latitude" is null and "operating_sites"."origin_longitude" is null) or ("operating_sites"."origin_latitude" between -90 and 90 and "operating_sites"."origin_longitude" between -180 and 180));