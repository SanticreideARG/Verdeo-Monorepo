CREATE TABLE "production_actuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"family_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"reported_by_user_id" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_actuals_quantity_nonnegative_check" CHECK ("production_actuals"."quantity_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_by_user_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_snapshots_kind_check" CHECK ("production_snapshots"."kind" in ('partial', 'final'))
);
--> statement-breakpoint
CREATE TABLE "surplus_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coefficient_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surplus_configs_coefficient_range_check" CHECK ("surplus_configs"."coefficient_percent" >= 0 and "surplus_configs"."coefficient_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "surplus_writeoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"family_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surplus_writeoffs_quantity_positive_check" CHECK ("surplus_writeoffs"."quantity_units" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_actuals" ADD CONSTRAINT "production_actuals_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_actuals" ADD CONSTRAINT "production_actuals_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_snapshots" ADD CONSTRAINT "production_snapshots_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_snapshots" ADD CONSTRAINT "production_snapshots_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_configs" ADD CONSTRAINT "surplus_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_writeoffs" ADD CONSTRAINT "surplus_writeoffs_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_writeoffs" ADD CONSTRAINT "surplus_writeoffs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_actuals_cycle_family_variant_unique" ON "production_actuals" USING btree ("sales_cycle_id","family_name","variant_name");--> statement-breakpoint
CREATE UNIQUE INDEX "production_snapshots_cycle_kind_unique" ON "production_snapshots" USING btree ("sales_cycle_id","kind");