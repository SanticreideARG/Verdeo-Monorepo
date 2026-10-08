CREATE TABLE "server_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_name" text NOT NULL,
	"message" text NOT NULL,
	"method" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"request_id" text NOT NULL,
	"status" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_errors_occurred_at_idx" ON "server_errors" USING btree ("occurred_at");