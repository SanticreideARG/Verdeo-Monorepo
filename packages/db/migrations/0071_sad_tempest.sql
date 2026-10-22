CREATE TABLE "label_prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_cycle_id" uuid NOT NULL,
	"label_key" text NOT NULL,
	"kind" text NOT NULL,
	"print_count" integer DEFAULT 1 NOT NULL,
	"first_printed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_printed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	CONSTRAINT "label_prints_kind_check" CHECK ("label_prints"."kind" in ('plato', 'menu'))
);
--> statement-breakpoint
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_sales_cycle_id_sales_cycles_id_fk" FOREIGN KEY ("sales_cycle_id") REFERENCES "public"."sales_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_prints" ADD CONSTRAINT "label_prints_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_prints_cycle_key_unique" ON "label_prints" USING btree ("sales_cycle_id","label_key");