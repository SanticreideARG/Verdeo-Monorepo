CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"family_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity_units" integer NOT NULL,
	"written_off_units" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"expires_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_quantity_check" CHECK ("stock_lots"."quantity_units" >= 0),
	CONSTRAINT "stock_lots_written_off_check" CHECK ("stock_lots"."written_off_units" >= 0 and "stock_lots"."written_off_units" <= "stock_lots"."quantity_units")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_lot_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_lots_site_idx" ON "stock_lots" USING btree ("operating_site_id","expires_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_stock_lot_idx" ON "order_items" USING btree ("stock_lot_id");
--> statement-breakpoint
-- El sobrante de un período anterior (production_stock con origin = 'carry_over') pasa a ser un lote
-- de su período de origen (STOCK_LOTS_PLAN.md). La ciudad sale del menú de ese período (o del
-- período donde estaba cargado); el vencimiento, un mes después del cierre de su período.
INSERT INTO "stock_lots" ("operating_site_id", "sales_cycle_id", "family_name", "variant_name", "quantity_units", "notes", "expires_at", "actor_user_id")
SELECT
  coalesce(
    (SELECT wm."operating_site_id" FROM "weekly_menus" wm WHERE wm."sales_cycle_id" = coalesce(ps."from_sales_cycle_id", ps."sales_cycle_id") AND wm."operating_site_id" IS NOT NULL LIMIT 1),
    (SELECT wm."operating_site_id" FROM "weekly_menus" wm WHERE wm."sales_cycle_id" = ps."sales_cycle_id" AND wm."operating_site_id" IS NOT NULL LIMIT 1),
    (SELECT os."id" FROM "operating_sites" os ORDER BY os."created_at" LIMIT 1)
  ),
  coalesce(ps."from_sales_cycle_id", ps."sales_cycle_id"),
  ps."family_name",
  ps."variant_name",
  ps."quantity_units",
  ps."notes",
  coalesce((SELECT sc."close_at" FROM "sales_cycles" sc WHERE sc."id" = coalesce(ps."from_sales_cycle_id", ps."sales_cycle_id")), now()) + interval '30 days',
  ps."actor_user_id"
FROM "production_stock" ps
WHERE ps."origin" = 'carry_over'
  AND EXISTS (SELECT 1 FROM "operating_sites");
--> statement-breakpoint
DELETE FROM "production_stock" WHERE "origin" = 'carry_over';
