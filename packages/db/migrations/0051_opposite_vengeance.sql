CREATE TABLE "manual_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"operating_site_id" uuid,
	"template_key" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"body" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_notices" ADD CONSTRAINT "manual_notices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_notices" ADD CONSTRAINT "manual_notices_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_notices" ADD CONSTRAINT "manual_notices_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_notices_order_idx" ON "manual_notices" USING btree ("order_id","template_key");--> statement-breakpoint
CREATE INDEX "manual_notices_customer_idx" ON "manual_notices" USING btree ("customer_id","created_at");