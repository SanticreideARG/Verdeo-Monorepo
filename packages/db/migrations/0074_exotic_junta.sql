ALTER TABLE "orders" ADD COLUMN "cancelled_to_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD COLUMN "dish_selections" jsonb;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD COLUMN "source_order_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;