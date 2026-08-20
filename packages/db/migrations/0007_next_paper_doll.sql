CREATE TABLE "geographic_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"coverage_description" text,
	"cover_image_url" text,
	"public_phone_override" text,
	"public_whatsapp_override" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geographic_zones_slug_check" CHECK ("geographic_zones"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "geographic_zones_sort_order_check" CHECK ("geographic_zones"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operating_site_order_counters" (
	"operating_site_id" uuid PRIMARY KEY NOT NULL,
	"last_order_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operating_site_order_counters_nonnegative_check" CHECK ("operating_site_order_counters"."last_order_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operating_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"order_prefix" text NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"cover_image_url" text,
	"public_phone" text,
	"public_whatsapp" text,
	"public_email" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operating_sites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "operating_sites_order_prefix_unique" UNIQUE("order_prefix"),
	CONSTRAINT "operating_sites_slug_check" CHECK ("operating_sites"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "operating_sites_order_prefix_check" CHECK ("operating_sites"."order_prefix" ~ '^[A-Z0-9]{1,8}$'),
	CONSTRAINT "operating_sites_sort_order_check" CHECK ("operating_sites"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_operating_sites" (
	"user_id" uuid NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"default_site" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_operating_sites_user_id_operating_site_id_pk" PRIMARY KEY("user_id","operating_site_id")
);
--> statement-breakpoint
CREATE TABLE "customer_operating_sites" (
	"customer_id" uuid NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"preferred_zone_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_operating_sites_customer_id_operating_site_id_pk" PRIMARY KEY("customer_id","operating_site_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "geographic_zones_id_site_unique" ON "geographic_zones" USING btree ("id","operating_site_id");--> statement-breakpoint
ALTER TABLE "geographic_zones" ADD CONSTRAINT "geographic_zones_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_site_order_counters" ADD CONSTRAINT "operating_site_order_counters_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_operating_sites" ADD CONSTRAINT "user_operating_sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_operating_sites" ADD CONSTRAINT "user_operating_sites_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_operating_sites" ADD CONSTRAINT "user_operating_sites_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_operating_sites" ADD CONSTRAINT "customer_operating_sites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_operating_sites" ADD CONSTRAINT "customer_operating_sites_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_operating_sites" ADD CONSTRAINT "customer_operating_sites_zone_site_fk" FOREIGN KEY ("preferred_zone_id","operating_site_id") REFERENCES "public"."geographic_zones"("id","operating_site_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geographic_zones_site_slug_unique" ON "geographic_zones" USING btree ("operating_site_id","slug");--> statement-breakpoint
CREATE INDEX "geographic_zones_site_active_order_idx" ON "geographic_zones" USING btree ("operating_site_id","active","sort_order");--> statement-breakpoint
CREATE INDEX "operating_sites_active_order_idx" ON "operating_sites" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_operating_sites_default_unique" ON "user_operating_sites" USING btree ("user_id") WHERE "user_operating_sites"."active" = true and "user_operating_sites"."default_site" = true;--> statement-breakpoint
CREATE INDEX "user_operating_sites_site_active_idx" ON "user_operating_sites" USING btree ("operating_site_id","active");--> statement-breakpoint
CREATE INDEX "customer_operating_sites_site_status_idx" ON "customer_operating_sites" USING btree ("operating_site_id","status");--> statement-breakpoint
CREATE INDEX "customer_operating_sites_customer_idx" ON "customer_operating_sites" USING btree ("customer_id");
