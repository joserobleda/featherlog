CREATE TABLE "post_views" (
	"post_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"source" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_views_post_id_subscriber_id_pk" PRIMARY KEY("post_id","subscriber_id")
);
--> statement-breakpoint
ALTER TABLE "newsletter_settings" ADD COLUMN "skip_readers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_settings" ADD COLUMN "identity_secret" text;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_views_subscriber_idx" ON "post_views" USING btree ("subscriber_id");