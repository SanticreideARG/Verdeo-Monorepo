DROP INDEX "weekly_menus_cycle_revision_unique";--> statement-breakpoint
ALTER TABLE "weekly_menu_offerings" ADD COLUMN "customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_menu_prices" ADD COLUMN "customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD COLUMN "operating_site_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD COLUMN "source_menu_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD CONSTRAINT "weekly_menus_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_menus" ADD CONSTRAINT "weekly_menus_source_menu_fk" FOREIGN KEY ("source_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menus_master_revision_unique" ON "weekly_menus" USING btree ("sales_cycle_id","revision") WHERE "weekly_menus"."operating_site_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_menus_site_revision_unique" ON "weekly_menus" USING btree ("sales_cycle_id","operating_site_id","revision") WHERE "weekly_menus"."operating_site_id" is not null;--> statement-breakpoint
CREATE INDEX "weekly_menus_site_status_idx" ON "weekly_menus" USING btree ("operating_site_id","status");