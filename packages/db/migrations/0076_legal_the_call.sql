CREATE TABLE "kitchen_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"operating_site_id" uuid,
	"format" text NOT NULL,
	"orders" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_sheets" ADD CONSTRAINT "kitchen_sheets_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_sheets" ADD CONSTRAINT "kitchen_sheets_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_sheets" ADD CONSTRAINT "kitchen_sheets_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kitchen_sheets_cycle_idx" ON "kitchen_sheets" USING btree ("sales_cycle_id","created_at");