ALTER TABLE "delivery_routes" ADD COLUMN "start_address" text;--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "start_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "start_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "end_address" text;--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "end_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "end_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "departure_time" text;--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_start_address" text;--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_start_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_start_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_end_address" text;--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_end_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "site_delivery_settings" ADD COLUMN "route_end_longitude" numeric(9, 6);