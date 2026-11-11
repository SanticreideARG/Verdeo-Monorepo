CREATE TABLE "inbound_email_rejections" (
	"reason" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"found" integer NOT NULL,
	"sent_new" integer NOT NULL,
	"duplicates" integer NOT NULL,
	"failed" integer NOT NULL,
	"error" text,
	"script_version" text NOT NULL,
	"quiet_runs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inbound_email_runs_ran_at_idx" ON "inbound_email_runs" USING btree ("ran_at");