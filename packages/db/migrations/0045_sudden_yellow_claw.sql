CREATE TABLE "assistant_flow_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"greeting" text NOT NULL,
	"options" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"greeting" text NOT NULL,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_flows_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "assistant_option_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_key" text NOT NULL,
	"option_key" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_flow_revisions" ADD CONSTRAINT "assistant_flow_revisions_flow_id_assistant_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."assistant_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_flow_revisions" ADD CONSTRAINT "assistant_flow_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_flow_revisions_unique" ON "assistant_flow_revisions" USING btree ("flow_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_option_hits_unique" ON "assistant_option_hits" USING btree ("flow_key","option_key");