CREATE TABLE "customer_logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_logins_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customer_logins_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
ALTER TABLE "customer_logins" ADD CONSTRAINT "customer_logins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_logins" ADD CONSTRAINT "customer_logins_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_logins_customer_idx" ON "customer_logins" USING btree ("customer_id");