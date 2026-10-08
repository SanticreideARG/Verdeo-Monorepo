CREATE TABLE "site_geocoding_settings" (
	"operating_site_id" uuid PRIMARY KEY NOT NULL,
	"auto_accept" boolean DEFAULT true NOT NULL,
	"confidence_threshold_percent" integer DEFAULT 90 NOT NULL,
	"city_context" text,
	"radius_km" integer DEFAULT 60 NOT NULL,
	"use_ai" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_geocoding_settings" ADD CONSTRAINT "site_geocoding_settings_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE cascade ON UPDATE no action;