DROP INDEX "production_stock_cycle_origin_variant_unique";--> statement-breakpoint
ALTER TABLE "production_stock" ADD COLUMN "operating_site_id" uuid;--> statement-breakpoint
ALTER TABLE "surplus_writeoffs" ADD COLUMN "operating_site_id" uuid;--> statement-breakpoint
ALTER TABLE "production_stock" ADD CONSTRAINT "production_stock_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_writeoffs" ADD CONSTRAINT "surplus_writeoffs_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Stock por ciudad (STOCK_POR_CIUDAD_PLAN.md): lo ya cargado toma la ciudad con la misma regla del
-- cierre (leftoverSite): la que más unidades confirmadas tiene de esa variedad en el período; si no
-- hay, la del menú del período; si no, la primera ciudad. Se corrige a mano en Cocina si hace falta.
UPDATE "production_stock" ps SET "operating_site_id" = COALESCE(
  (
    SELECT o."operating_site_id"
    FROM "order_items" oi
    JOIN "orders" o ON o."id" = oi."order_id"
    WHERE o."sales_cycle_id" = ps."sales_cycle_id"
      AND o."status" IN ('CONFIRMED', 'READY', 'DELIVERED')
      AND o."operating_site_id" IS NOT NULL
      AND oi."product_name_snapshot" = ps."family_name"
      AND oi."variant_snapshot" = ps."variant_name"
    GROUP BY o."operating_site_id"
    ORDER BY sum(oi."quantity_units") DESC, o."operating_site_id"
    LIMIT 1
  ),
  (
    SELECT wm."operating_site_id"
    FROM "weekly_menus" wm
    WHERE wm."sales_cycle_id" = ps."sales_cycle_id" AND wm."operating_site_id" IS NOT NULL
    LIMIT 1
  ),
  (SELECT s."id" FROM "operating_sites" s ORDER BY s."created_at" LIMIT 1)
)
WHERE ps."operating_site_id" IS NULL;--> statement-breakpoint
UPDATE "surplus_writeoffs" sw SET "operating_site_id" = COALESCE(
  (
    SELECT o."operating_site_id"
    FROM "order_items" oi
    JOIN "orders" o ON o."id" = oi."order_id"
    WHERE o."sales_cycle_id" = sw."sales_cycle_id"
      AND o."status" IN ('CONFIRMED', 'READY', 'DELIVERED')
      AND o."operating_site_id" IS NOT NULL
      AND oi."product_name_snapshot" = sw."family_name"
      AND oi."variant_snapshot" = sw."variant_name"
    GROUP BY o."operating_site_id"
    ORDER BY sum(oi."quantity_units") DESC, o."operating_site_id"
    LIMIT 1
  ),
  (
    SELECT wm."operating_site_id"
    FROM "weekly_menus" wm
    WHERE wm."sales_cycle_id" = sw."sales_cycle_id" AND wm."operating_site_id" IS NOT NULL
    LIMIT 1
  ),
  (SELECT s."id" FROM "operating_sites" s ORDER BY s."created_at" LIMIT 1)
)
WHERE sw."operating_site_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "production_stock_cycle_site_origin_variant_unique" ON "production_stock" USING btree ("sales_cycle_id","operating_site_id","origin","family_name","variant_name");