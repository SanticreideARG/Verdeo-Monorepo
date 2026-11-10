-- Sale el estado Listo: los pedidos que lo tienen vuelven a Confirmado (2026-11-09).
INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "reason")
SELECT "id", 'READY', 'CONFIRMED', 'Se eliminó el estado Listo' FROM "orders" WHERE "status" = 'READY';
--> statement-breakpoint
UPDATE "orders" SET "status" = 'CONFIRMED', "updated_at" = now() WHERE "status" = 'READY';
