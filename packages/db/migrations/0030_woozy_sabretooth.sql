CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_api_key" text,
	"api_key_last_four" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_credentials_key_unique" UNIQUE("key"),
	CONSTRAINT "integration_credentials_key_check" CHECK ("integration_credentials"."key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
