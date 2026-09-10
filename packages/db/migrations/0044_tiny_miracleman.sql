ALTER TABLE "survey_responses" ALTER COLUMN "token_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_responses" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_public_token_unique" UNIQUE("public_token");