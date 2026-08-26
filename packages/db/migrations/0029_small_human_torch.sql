CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"is_cash" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_code_unique" ON "payment_methods" USING btree ("code");
--> statement-breakpoint
INSERT INTO "payment_methods" ("code", "display_name", "is_cash", "active", "sort_order") VALUES
	('efectivo', 'Efectivo', true, true, 0),
	('transferencia', 'Transferencia', false, true, 1);