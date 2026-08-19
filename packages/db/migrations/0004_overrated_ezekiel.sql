CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"written_address" text NOT NULL,
	"city" text,
	"sector" text,
	"operational_zone" text,
	"property_type" text,
	"unit" text,
	"access_notes" text,
	"location_url" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"geocoding_status" text DEFAULT 'NEEDS_LOCATION' NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_coordinates_check" CHECK (("customer_addresses"."latitude" is null and "customer_addresses"."longitude" is null) or ("customer_addresses"."latitude" between -90 and 90 and "customer_addresses"."longitude" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"action_key" text,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_reference_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "customer_identities" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_location_url_snapshot" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restrictions" ADD CONSTRAINT "customer_restrictions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_addresses_zone_idx" ON "customer_addresses" USING btree ("operational_zone");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_primary_unique" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."active" = true and "customer_addresses"."primary" = true;--> statement-breakpoint
CREATE INDEX "customer_preferences_customer_idx" ON "customer_preferences" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_preferences_active_unique" ON "customer_preferences" USING btree ("customer_id","category","value") WHERE "customer_preferences"."active" = true;--> statement-breakpoint
CREATE INDEX "customer_restrictions_customer_idx" ON "customer_restrictions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_restrictions_active_idx" ON "customer_restrictions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "message_templates_action_idx" ON "message_templates" USING btree ("action_key","active");--> statement-breakpoint
CREATE INDEX "message_templates_scope_idx" ON "message_templates" USING btree ("scope_type","scope_reference_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_customer_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_primary_type_unique" ON "customer_identities" USING btree ("customer_id","type") WHERE "customer_identities"."active" = true and "customer_identities"."primary" = true;