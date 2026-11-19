ALTER TABLE "site_delivery_settings" ADD COLUMN "order_zone_from_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Valle y Mendoza: la Zona del pedido es la del domicilio (pedido 2026-11-18). Se cambia en Panel de
-- control → Reparto. No hace nada si la ciudad no existe con ese nombre.
INSERT INTO "site_delivery_settings" ("operating_site_id", "order_zone_from_address")
SELECT "id", true
FROM "operating_sites"
WHERE lower("display_name") IN ('valle', 'alto valle', 'mendoza') OR "slug" IN ('valle', 'alto-valle', 'mendoza')
ON CONFLICT ("operating_site_id") DO UPDATE SET "order_zone_from_address" = true, "updated_at" = now();
