ALTER TABLE "menu_catalog_settings" ADD COLUMN "intuitivo_max_dishes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD COLUMN "intuitivo_pricing_mode" text DEFAULT 'proporcional' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD COLUMN "intuitivo_pricing_factor_bp" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD COLUMN "intuitivo_extra_dish_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD COLUMN "intuitivo_rounding_minor" integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD CONSTRAINT "menu_catalog_settings_max_dishes_check" CHECK ("menu_catalog_settings"."intuitivo_max_dishes" >= 1);--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD CONSTRAINT "menu_catalog_settings_pricing_mode_check" CHECK ("menu_catalog_settings"."intuitivo_pricing_mode" in ('proporcional', 'coeficiente', 'monto_fijo'));--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD CONSTRAINT "menu_catalog_settings_factor_check" CHECK ("menu_catalog_settings"."intuitivo_pricing_factor_bp" > 0);--> statement-breakpoint
ALTER TABLE "menu_catalog_settings" ADD CONSTRAINT "menu_catalog_settings_rounding_check" CHECK ("menu_catalog_settings"."intuitivo_rounding_minor" >= 0 and "menu_catalog_settings"."intuitivo_extra_dish_minor" >= 0);