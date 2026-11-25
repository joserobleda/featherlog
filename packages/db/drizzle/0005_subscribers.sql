CREATE TABLE "subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"external_id" text,
	"name" text,
	"locale" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"source" text DEFAULT 'api' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_external_idx" ON "subscribers" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("workspace_id","status","created_at");