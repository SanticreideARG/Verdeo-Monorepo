-- Neuquén is the initial operation and receives every record that predates regional scope.
-- Only created when the installation has no operation yet.
INSERT INTO "operating_sites" ("slug", "display_name", "order_prefix", "sort_order")
SELECT 'neuquen', 'Neuquén', 'NQN', 0
WHERE NOT EXISTS (SELECT 1 FROM "operating_sites");--> statement-breakpoint

-- Landing zone for addresses that predate zoning. It is a real, renameable zone: an operator
-- reassigns these addresses to their actual zone and can then deactivate it.
INSERT INTO "geographic_zones" ("operating_site_id", "slug", "display_name", "coverage_description")
SELECT s."id", 'sin-clasificar', 'Sin clasificar',
       'Zona temporal de migración: reasignar estos domicilios a su zona real.'
FROM "operating_sites" AS s
WHERE s."id" = (
        SELECT "id" FROM "operating_sites" WHERE "active" ORDER BY "sort_order", "display_name" LIMIT 1
      )
  AND NOT EXISTS (
        SELECT 1 FROM "geographic_zones" AS z
        WHERE z."operating_site_id" = s."id" AND z."slug" = 'sin-clasificar'
      );--> statement-breakpoint

-- Regional numbering starts where the global sequence left off, so public numbers keep increasing
-- for the operation that owns the historical orders.
INSERT INTO "operating_site_order_counters" ("operating_site_id", "last_order_number")
SELECT s."id",
       CASE
         WHEN s."id" = (
           SELECT "id" FROM "operating_sites" WHERE "active" ORDER BY "sort_order", "display_name" LIMIT 1
         )
         THEN (SELECT COUNT(*)::int FROM "orders")
         ELSE 0
       END
FROM "operating_sites" AS s
ON CONFLICT ("operating_site_id") DO NOTHING;--> statement-breakpoint

-- Existing customers and users keep exactly the access they had: one operation, everything in it.
INSERT INTO "customer_operating_sites" ("customer_id", "operating_site_id")
SELECT c."id",
       (SELECT "id" FROM "operating_sites" WHERE "active" ORDER BY "sort_order", "display_name" LIMIT 1)
FROM "customers" AS c
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "user_operating_sites" ("user_id", "operating_site_id", "default_site")
SELECT u."id",
       (SELECT "id" FROM "operating_sites" WHERE "active" ORDER BY "sort_order", "display_name" LIMIT 1),
       true
FROM "users" AS u
WHERE u."status" = 'active'
ON CONFLICT DO NOTHING;--> statement-breakpoint

ALTER TABLE "customer_addresses" ADD COLUMN "geographic_zone_id" uuid;--> statement-breakpoint

UPDATE "customer_addresses"
SET "geographic_zone_id" = (
  SELECT z."id"
  FROM "geographic_zones" AS z
  JOIN "operating_sites" AS s ON s."id" = z."operating_site_id"
  WHERE z."slug" = 'sin-clasificar'
  ORDER BY s."sort_order", s."display_name"
  LIMIT 1
)
WHERE "geographic_zone_id" IS NULL;--> statement-breakpoint

ALTER TABLE "customer_addresses" ALTER COLUMN "geographic_zone_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_geographic_zone_id_geographic_zones_id_fk" FOREIGN KEY ("geographic_zone_id") REFERENCES "public"."geographic_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "operating_site_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "geographic_zone_id" uuid;--> statement-breakpoint

-- The operation of an order is derived from the zone of its delivery address (ADR-031).
UPDATE "orders" AS o
SET "geographic_zone_id" = a."geographic_zone_id"
FROM "customer_addresses" AS a
WHERE a."id" = o."delivery_address_id";--> statement-breakpoint

UPDATE "orders" AS o
SET "operating_site_id" = z."operating_site_id"
FROM "geographic_zones" AS z
WHERE z."id" = o."geographic_zone_id";--> statement-breakpoint

-- Orders whose stored address was removed keep no zone, so they fall back to the initial operation.
UPDATE "orders"
SET "operating_site_id" = (
  SELECT "id" FROM "operating_sites" WHERE "active" ORDER BY "sort_order", "display_name" LIMIT 1
)
WHERE "operating_site_id" IS NULL;--> statement-breakpoint

ALTER TABLE "orders" ALTER COLUMN "operating_site_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_site_fk" FOREIGN KEY ("geographic_zone_id","operating_site_id") REFERENCES "public"."geographic_zones"("id","operating_site_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_site_status_idx" ON "orders" USING btree ("operating_site_id","status");--> statement-breakpoint
CREATE INDEX "orders_site_created_at_idx" ON "orders" USING btree ("operating_site_id","created_at");--> statement-breakpoint

-- Public numbers are now assigned transactionally from the operation's counter and prefix.
ALTER TABLE "orders" ALTER COLUMN "public_number" DROP DEFAULT;
