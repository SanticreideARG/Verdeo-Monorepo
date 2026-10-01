ALTER TABLE "access_tokens" DROP CONSTRAINT "access_tokens_kind_check";--> statement-breakpoint
ALTER TABLE "cash_collections" ALTER COLUMN "collected_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "delivery_route_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_stops" ADD COLUMN "delivery_note" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "delivery_window" text;--> statement-breakpoint
ALTER TABLE "cash_collections" ADD COLUMN "delivery_route_id" uuid;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_delivery_route_id_delivery_routes_id_fk" FOREIGN KEY ("delivery_route_id") REFERENCES "public"."delivery_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_delivery_route_id_delivery_routes_id_fk" FOREIGN KEY ("delivery_route_id") REFERENCES "public"."delivery_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_kind_check" CHECK ("access_tokens"."kind" in ('repartidor_access', 'user_invite', 'route_access'));--> statement-breakpoint
ALTER TABLE "cash_collections" ADD CONSTRAINT "cash_collections_origin_check" CHECK ("cash_collections"."collected_by_user_id" is not null or "cash_collections"."delivery_route_id" is not null);