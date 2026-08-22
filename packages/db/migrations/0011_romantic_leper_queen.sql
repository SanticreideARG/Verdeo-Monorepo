CREATE TABLE "chat_role_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_a_id" uuid NOT NULL,
	"role_b_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_role_links_normalized_check" CHECK ("chat_role_links"."role_a_id" <= "chat_role_links"."role_b_id")
);
--> statement-breakpoint
CREATE TABLE "chat_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_user_links_normalized_check" CHECK ("chat_user_links"."user_a_id" < "chat_user_links"."user_b_id"),
	CONSTRAINT "chat_user_links_effect_check" CHECK ("chat_user_links"."effect" in ('allow', 'deny'))
);
--> statement-breakpoint
CREATE TABLE "staff_conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"muted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "staff_conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "staff_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'direct' NOT NULL,
	"title" text,
	"direct_key" text,
	"created_by_user_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_conversations_kind_check" CHECK ("staff_conversations"."kind" in ('direct', 'group')),
	CONSTRAINT "staff_conversations_direct_key_check" CHECK (("staff_conversations"."kind" = 'direct' and "staff_conversations"."direct_key" is not null) or ("staff_conversations"."kind" = 'group' and "staff_conversations"."direct_key" is null))
);
--> statement-breakpoint
CREATE TABLE "staff_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_user_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "staff_messages_kind_check" CHECK ("staff_messages"."kind" in ('text', 'location', 'reference')),
	CONSTRAINT "staff_messages_body_check" CHECK ("staff_messages"."deleted_at" is not null or "staff_messages"."kind" <> 'text' or "staff_messages"."body" is not null)
);
--> statement-breakpoint
ALTER TABLE "chat_role_links" ADD CONSTRAINT "chat_role_links_role_a_id_roles_id_fk" FOREIGN KEY ("role_a_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_role_links" ADD CONSTRAINT "chat_role_links_role_b_id_roles_id_fk" FOREIGN KEY ("role_b_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_user_links" ADD CONSTRAINT "chat_user_links_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_user_links" ADD CONSTRAINT "chat_user_links_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_user_links" ADD CONSTRAINT "chat_user_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_conversation_participants" ADD CONSTRAINT "staff_conversation_participants_conversation_id_staff_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."staff_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_conversation_participants" ADD CONSTRAINT "staff_conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_conversations" ADD CONSTRAINT "staff_conversations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_conversation_id_staff_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."staff_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_role_links_pair_unique" ON "chat_role_links" USING btree ("role_a_id","role_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_user_links_pair_unique" ON "chat_user_links" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "staff_conversation_participants_user_idx" ON "staff_conversation_participants" USING btree ("user_id","left_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_conversations_direct_key_unique" ON "staff_conversations" USING btree ("direct_key") WHERE "staff_conversations"."direct_key" is not null;--> statement-breakpoint
CREATE INDEX "staff_conversations_last_message_idx" ON "staff_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "staff_messages_conversation_created_idx" ON "staff_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_messages_created_idx" ON "staff_messages" USING btree ("created_at");