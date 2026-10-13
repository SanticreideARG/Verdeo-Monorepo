CREATE TABLE "neighborhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geographic_zone_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"name_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neighborhoods_name_key_check" CHECK (length("neighborhoods"."name_key") > 0)
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "neighborhood_id" uuid;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_geographic_zone_id_geographic_zones_id_fk" FOREIGN KEY ("geographic_zone_id") REFERENCES "public"."geographic_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "neighborhoods_zone_name_unique" ON "neighborhoods" USING btree ("geographic_zone_id","name_key");--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Los domicilios que ya traían el barrio como texto libre ("sector") pasan a tener su barrio.
-- La clave es la misma que arma neighborhoodKey(): minúsculas, sin tildes, espacios simples.
INSERT INTO "neighborhoods" ("geographic_zone_id", "display_name", "name_key")
SELECT DISTINCT ON ("geographic_zone_id", "key") "geographic_zone_id", "name", "key"
FROM (
  SELECT "geographic_zone_id", regexp_replace(trim("sector"), '\s+', ' ', 'g') AS "name",
    translate(lower(regexp_replace(trim("sector"), '\s+', ' ', 'g')), 'áéíóúüñàèìòù', 'aeiouunaeiou') AS "key"
  FROM "customer_addresses"
  WHERE "sector" IS NOT NULL AND trim("sector") <> ''
) AS "sectores"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "customer_addresses" AS "a" SET "neighborhood_id" = "n"."id"
FROM "neighborhoods" AS "n"
WHERE "a"."sector" IS NOT NULL
  AND "n"."geographic_zone_id" = "a"."geographic_zone_id"
  AND "n"."name_key" = translate(lower(regexp_replace(trim("a"."sector"), '\s+', ' ', 'g')), 'áéíóúüñàèìòù', 'aeiouunaeiou');
