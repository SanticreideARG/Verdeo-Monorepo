CREATE TABLE "cancellation_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"counts_as_failed_delivery" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cancellation_reasons_code_check" CHECK ("cancellation_reasons"."code" ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "transfer_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"operation_code" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"receipt_url" text,
	"receipt_expires_at" timestamp with time zone,
	"notes" text,
	"reconciled_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_reconciliations_amount_check" CHECK ("transfer_reconciliations"."amount_minor" > 0),
	CONSTRAINT "transfer_reconciliations_code_check" CHECK ("transfer_reconciliations"."operation_code" ~ '^[0-9]{6,32}$')
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_notes" text;--> statement-breakpoint
ALTER TABLE "transfer_reconciliations" ADD CONSTRAINT "transfer_reconciliations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_reconciliations" ADD CONSTRAINT "transfer_reconciliations_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_reasons_code_unique" ON "cancellation_reasons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_reconciliations_operation_code_unique" ON "transfer_reconciliations" USING btree ("operation_code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_id_cancellation_reasons_id_fk" FOREIGN KEY ("cancellation_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE set null ON UPDATE no action;