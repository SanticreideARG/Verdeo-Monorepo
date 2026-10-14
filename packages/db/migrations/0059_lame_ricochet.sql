CREATE TABLE "site_delivery_settings" (
	"operating_site_id" uuid PRIMARY KEY NOT NULL,
	"weekdays" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"default_weekday" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_delivery_settings_weekdays_check" CHECK ("site_delivery_settings"."weekdays" <@ array[0,1,2,3,4,5,6]),
	CONSTRAINT "site_delivery_settings_default_check" CHECK ("site_delivery_settings"."default_weekday" is null or "site_delivery_settings"."default_weekday" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD CONSTRAINT "site_delivery_settings_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;