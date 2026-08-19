CREATE TABLE "order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_revisions_order_revision_unique" ON "order_revisions" USING btree ("order_id","revision");--> statement-breakpoint
CREATE INDEX "order_revisions_order_idx" ON "order_revisions" USING btree ("order_id","created_at");