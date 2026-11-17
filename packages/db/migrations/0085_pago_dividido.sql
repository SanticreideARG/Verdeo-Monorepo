CREATE TABLE "order_payment_parts" (
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"method" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payment_parts_order_id_position_pk" PRIMARY KEY("order_id","position"),
	CONSTRAINT "order_payment_parts_amount_check" CHECK ("order_payment_parts"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_payment_parts" ADD CONSTRAINT "order_payment_parts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_parts" ADD CONSTRAINT "order_payment_parts_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;