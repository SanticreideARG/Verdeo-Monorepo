CREATE TABLE "delivery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operating_site_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"label" text NOT NULL,
	"time_window" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"auto_created" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"consolidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_runs_status_check" CHECK ("delivery_runs"."status" in ('planned', 'consolidated', 'dispatched', 'closed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD COLUMN "delivery_run_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_run_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_runs_site_date_idx" ON "delivery_runs" USING btree ("operating_site_id","delivery_date");--> statement-breakpoint
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_delivery_run_id_delivery_runs_id_fk" FOREIGN KEY ("delivery_run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_run_id_delivery_runs_id_fk" FOREIGN KEY ("delivery_run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_delivery_run_idx" ON "orders" USING btree ("delivery_run_id");--> statement-breakpoint
-- Carga inicial: un reparto por cada ciudad y fecha con pedidos no cancelados ("Domingo 18"). Los
-- de fechas pasadas quedan cerrados; los de hoy en adelante, abiertos.
INSERT INTO "delivery_runs" ("operating_site_id", "delivery_date", "label", "status", "is_default", "auto_created")
SELECT d."operating_site_id", d."delivery_date",
  (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from d."delivery_date")::int + 1]
    || ' ' || extract(day from d."delivery_date")::int,
  CASE WHEN d."delivery_date" < (now() at time zone 'America/Argentina/Buenos_Aires')::date THEN 'closed' ELSE 'planned' END,
  true, true
FROM (
  SELECT DISTINCT "operating_site_id", "delivery_date" FROM "orders" WHERE "status" <> 'CANCELLED'
) AS d;
--> statement-breakpoint
UPDATE "orders" AS o SET "delivery_run_id" = r."id"
FROM "delivery_runs" AS r
WHERE o."status" <> 'CANCELLED'
  AND r."operating_site_id" = o."operating_site_id"
  AND r."delivery_date" = o."delivery_date";
--> statement-breakpoint
UPDATE "delivery_routes" AS h SET "delivery_run_id" = r."id"
FROM "delivery_runs" AS r
WHERE r."operating_site_id" = h."operating_site_id"
  AND r."delivery_date" = h."delivery_date";
