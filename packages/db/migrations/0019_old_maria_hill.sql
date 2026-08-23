CREATE TABLE "messaging_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'whatsapp' NOT NULL,
	"label" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text,
	"display_phone_number" text,
	"access_token" text,
	"operating_site_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_accounts_phone_number_id_unique" UNIQUE("phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"messaging_account_id" uuid NOT NULL,
	"operating_site_id" uuid,
	"customer_id" uuid,
	"customer_identity_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by_user_id" uuid,
	"last_handled_by_user_id" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messaging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"external_id" text,
	"sender_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messaging_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_webhook_events_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_messaging_account_id_messaging_accounts_id_fk" FOREIGN KEY ("messaging_account_id") REFERENCES "public"."messaging_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_operating_site_id_operating_sites_id_fk" FOREIGN KEY ("operating_site_id") REFERENCES "public"."operating_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_customer_identity_id_customer_identities_id_fk" FOREIGN KEY ("customer_identity_id") REFERENCES "public"."customer_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_last_handled_by_user_id_users_id_fk" FOREIGN KEY ("last_handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_conversations_account_idx" ON "messaging_conversations" USING btree ("messaging_account_id","last_message_at");--> statement-breakpoint
CREATE INDEX "messaging_conversations_customer_idx" ON "messaging_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "messaging_conversations_identity_idx" ON "messaging_conversations" USING btree ("customer_identity_id");--> statement-breakpoint
CREATE INDEX "messaging_messages_conversation_idx" ON "messaging_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_messages_external_idx" ON "messaging_messages" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "messaging_webhook_events_created_idx" ON "messaging_webhook_events" USING btree ("created_at");