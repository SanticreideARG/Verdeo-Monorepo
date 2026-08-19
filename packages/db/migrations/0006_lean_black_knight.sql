CREATE TABLE "geocoding_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider_candidate_id" text NOT NULL,
	"formatted_address" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"city" text,
	"sector" text,
	"location_url" text,
	"confidence" numeric(5, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocoding_candidates_coordinates_check" CHECK ("geocoding_candidates"."latitude" between -90 and 90 and "geocoding_candidates"."longitude" between -180 and 180),
	CONSTRAINT "geocoding_candidates_confidence_check" CHECK ("geocoding_candidates"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "geocoding_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_key" text NOT NULL,
	"query_text" text NOT NULL,
	"location_url" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"error_code" text,
	"error_message" text,
	"selected_candidate_id" uuid,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocoding_requests_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "geocoding_candidates" ADD CONSTRAINT "geocoding_candidates_request_id_geocoding_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."geocoding_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_requests" ADD CONSTRAINT "geocoding_requests_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geocoding_candidates_provider_unique" ON "geocoding_candidates" USING btree ("request_id","provider_candidate_id");--> statement-breakpoint
CREATE INDEX "geocoding_candidates_request_idx" ON "geocoding_candidates" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "geocoding_requests_address_idx" ON "geocoding_requests" USING btree ("address_id","created_at");--> statement-breakpoint
CREATE INDEX "geocoding_requests_status_idx" ON "geocoding_requests" USING btree ("status","updated_at");