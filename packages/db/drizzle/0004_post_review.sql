ALTER TABLE "posts" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "review_requested_by" text;