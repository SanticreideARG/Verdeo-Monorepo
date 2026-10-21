ALTER TABLE "order_item_selections" ADD COLUMN "source_menu_item_id" uuid;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD COLUMN "source_family_snapshot" text;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD COLUMN "source_slot" integer;--> statement-breakpoint
ALTER TABLE "order_item_selections" ADD CONSTRAINT "order_item_selections_source_menu_item_id_weekly_menu_items_id_fk" FOREIGN KEY ("source_menu_item_id") REFERENCES "public"."weekly_menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Pedidos viejos: el origen sólo cuando el nombre está en un único menú del mismo tamaño y semana.
-- Si está en dos o más, queda sin origen (no se adivina) y cocina lo muestra aparte.
WITH candidates AS (
  SELECT s.id AS selection_id, wmi.id AS menu_item_id, pf2.display_name AS family_name,
         wmi.slot AS slot, pf2.id AS family_id
  FROM order_item_selections s
  JOIN order_items oi ON oi.id = s.order_item_id
  JOIN weekly_menu_offerings o1 ON o1.id = oi.offering_id
  JOIN product_variants pv1 ON pv1.id = o1.product_variant_id
  JOIN weekly_menu_offerings o2 ON o2.weekly_menu_id = o1.weekly_menu_id
  JOIN product_variants pv2 ON pv2.id = o2.product_variant_id
    AND pv2.product_size_id = pv1.product_size_id
  JOIN product_families pf2 ON pf2.id = pv2.product_family_id AND pf2.kind <> 'COMPOSABLE'
  JOIN weekly_menu_items wmi ON wmi.offering_id = o2.id AND wmi.dish_name = s.dish_name_snapshot
  WHERE s.source_menu_item_id IS NULL
),
unique_ones AS (
  SELECT selection_id
  FROM candidates
  GROUP BY selection_id
  HAVING count(DISTINCT family_id) = 1
),
chosen AS (
  SELECT DISTINCT ON (c.selection_id) c.selection_id, c.menu_item_id, c.family_name, c.slot
  FROM candidates c
  JOIN unique_ones u ON u.selection_id = c.selection_id
  ORDER BY c.selection_id, c.slot
)
UPDATE order_item_selections s
SET source_menu_item_id = chosen.menu_item_id,
    source_family_snapshot = chosen.family_name,
    source_slot = chosen.slot
FROM chosen
WHERE chosen.selection_id = s.id;
