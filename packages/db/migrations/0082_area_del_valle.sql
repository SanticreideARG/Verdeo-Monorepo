-- Valle es una región de siete localidades en dos provincias: las búsquedas de direcciones se
-- limitan a ellas (2026-11-10). No hace nada si la ciudad no existe con ese nombre.
INSERT INTO "site_geocoding_settings" ("operating_site_id", "city_context")
SELECT "id", 'Plottier; Neuquén; Cipolletti; General Fernández Oro; General Roca, Río Negro; Villa Regina; Allen'
FROM "operating_sites"
WHERE lower("display_name") IN ('valle', 'alto valle') OR "slug" IN ('valle', 'alto-valle')
ON CONFLICT ("operating_site_id") DO UPDATE SET "city_context" = EXCLUDED."city_context", "updated_at" = now();
