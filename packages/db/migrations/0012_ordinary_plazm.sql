CREATE TABLE "chat_presence_statuses" (
	"key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"reachable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_presence_statuses_sort_order_check" CHECK ("chat_presence_statuses"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"status_message" text,
	"last_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_presence" ADD CONSTRAINT "staff_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_presence_statuses_active_order_idx" ON "chat_presence_statuses" USING btree ("active","sort_order");--> statement-breakpoint
CREATE INDEX "staff_presence_last_seen_idx" ON "staff_presence" USING btree ("last_seen_at");--> statement-breakpoint

-- The three documented statuses. Rows, not code: adding one never needs a deploy.
INSERT INTO "chat_presence_statuses" ("key", "display_name", "reachable", "sort_order") VALUES
  ('available', 'Disponible', true, 0),
  ('away', 'Ausente', false, 1),
  ('busy', 'Ocupado', false, 2)
ON CONFLICT ("key") DO NOTHING;
