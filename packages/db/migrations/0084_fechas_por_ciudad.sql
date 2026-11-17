CREATE TABLE "sales_cycle_site_dates" (
	"sales_cycle_id" uuid NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"open_at" timestamp with time zone,
	"partial_kitchen_cutoff_at" timestamp with time zone,
	"close_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_cycle_site_dates_sales_cycle_id_operating_site_id_pk" PRIMARY KEY("sales_cycle_id","operating_site_id")
);
--> statement-breakpoint
ALTER TABLE "sales_cycle_site_dates" ADD CONSTRAINT "sales_cycle_site_dates_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_cycle_site_dates" ADD CONSTRAINT "sales_cycle_site_dates_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_cycle_site_dates" ADD CONSTRAINT "sales_cycle_site_dates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;