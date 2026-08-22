CREATE TABLE "product_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"meals_per_unit" integer DEFAULT 5 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sizes_code_unique" UNIQUE("code"),
	CONSTRAINT "product_sizes_meals_positive_check" CHECK ("product_sizes"."meals_per_unit" > 0),
	CONSTRAINT "product_sizes_sort_order_check" CHECK ("product_sizes"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_menu_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_menu_id" uuid NOT NULL,
	"product_size_id" uuid NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_menu_prices_price_check" CHECK ("weekly_menu_prices"."unit_price_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "weekly_menu_prices" ADD CONSTRAINT "weekly_menu_prices_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menu_prices" ADD CONSTRAINT "weekly_menu_prices_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_sizes_active_order_idx" ON "product_sizes" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menu_prices_menu_size_unique" ON "weekly_menu_prices" USING btree ("weekly_menu_id","product_size_id");--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "kind" text DEFAULT 'FIXED' NOT NULL;--> statement-breakpoint

-- Size was embedded in the variant code ('250', '400'). Promote the distinct codes to the size
-- catalog before the column can be required.
INSERT INTO "product_sizes" ("code", "display_name", "meals_per_unit", "sort_order")
SELECT DISTINCT ON ("code") "code", "display_name", "meals_per_unit", 0
FROM "product_variants"
ORDER BY "code", "created_at";--> statement-breakpoint

ALTER TABLE "product_variants" ADD COLUMN "product_size_id" uuid;--> statement-breakpoint

UPDATE "product_variants" AS v
SET "product_size_id" = s."id"
FROM "product_sizes" AS s
WHERE s."code" = v."code";--> statement-breakpoint

ALTER TABLE "product_variants" ALTER COLUMN "product_size_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_family_size_unique" ON "product_variants" USING btree ("product_family_id","product_size_id");--> statement-breakpoint

-- One-time recognition of the existing composable variety. From here the engine reads `kind`, so the
-- display name can be renamed freely without changing behaviour.
UPDATE "product_families"
SET "kind" = 'COMPOSABLE'
WHERE "code" = 'intuitivo';--> statement-breakpoint

-- Price moves from the offering (menu x variety) to a per-size list. Existing menus keep their exact
-- amounts: the list takes the lowest price recorded for each size, and any variety that differed
-- survives as an explicit override rather than being flattened.
INSERT INTO "weekly_menu_prices" ("weekly_menu_id", "product_size_id", "unit_price_minor", "currency")
SELECT o."weekly_menu_id", v."product_size_id", MIN(o."unit_price_minor"), MIN(o."currency")
FROM "weekly_menu_offerings" AS o
JOIN "product_variants" AS v ON v."id" = o."product_variant_id"
GROUP BY o."weekly_menu_id", v."product_size_id";--> statement-breakpoint

ALTER TABLE "weekly_menu_offerings" DROP CONSTRAINT "weekly_menu_offerings_price_check";--> statement-breakpoint
ALTER TABLE "weekly_menu_offerings" ALTER COLUMN "unit_price_minor" DROP NOT NULL;--> statement-breakpoint

UPDATE "weekly_menu_offerings" AS o
SET "unit_price_minor" = NULL
FROM "product_variants" AS v, "weekly_menu_prices" AS p
WHERE v."id" = o."product_variant_id"
  AND p."weekly_menu_id" = o."weekly_menu_id"
  AND p."product_size_id" = v."product_size_id"
  AND o."unit_price_minor" = p."unit_price_minor";--> statement-breakpoint

ALTER TABLE "product_families" ADD CONSTRAINT "product_families_kind_check" CHECK ("product_families"."kind" in ('FIXED', 'COMPOSABLE'));--> statement-breakpoint
ALTER TABLE "weekly_menu_offerings" ADD CONSTRAINT "weekly_menu_offerings_price_check" CHECK ("weekly_menu_offerings"."unit_price_minor" is null or "weekly_menu_offerings"."unit_price_minor" >= 0);
