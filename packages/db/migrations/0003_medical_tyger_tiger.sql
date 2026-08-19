CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"adapter_type" text NOT NULL,
	"base_url" text NOT NULL,
	"default_model" text NOT NULL,
	"encrypted_api_key" text,
	"api_key_last_four" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "ai_provider_configs_enabled_idx" ON "ai_provider_configs" USING btree ("enabled");