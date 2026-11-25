CREATE TABLE "newsletter_deliveries" (
	"newsletter_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	"email" text NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "newsletter_deliveries_newsletter_id_subscriber_id_pk" PRIMARY KEY("newsletter_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_posts" (
	"newsletter_id" text NOT NULL,
	"post_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	CONSTRAINT "newsletter_posts_newsletter_id_post_id_pk" PRIMARY KEY("newsletter_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"from_name" text,
	"reply_to" text,
	"footer_text" text DEFAULT '' NOT NULL,
	"ai_instructions" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_translations" (
	"newsletter_id" text NOT NULL,
	"locale" text NOT NULL,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_translations_newsletter_id_locale_pk" PRIMARY KEY("newsletter_id","locale")
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generator" text DEFAULT 'basic' NOT NULL,
	"error" text,
	"period_from" timestamp with time zone,
	"period_to" timestamp with time zone,
	"created_via" text DEFAULT 'panel' NOT NULL,
	"created_by" text,
	"actor_label" text,
	"sent_by" text,
	"send_started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_posts" ADD CONSTRAINT "newsletter_posts_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_posts" ADD CONSTRAINT "newsletter_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_settings" ADD CONSTRAINT "newsletter_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_translations" ADD CONSTRAINT "newsletter_translations_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_deliveries_status_idx" ON "newsletter_deliveries" USING btree ("newsletter_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_posts_post_idx" ON "newsletter_posts" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "newsletters_workspace_idx" ON "newsletters" USING btree ("workspace_id","created_at");