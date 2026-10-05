CREATE TABLE "post_imports" (
	"workspace_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"post_id" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_imports_workspace_id_source_external_id_pk" PRIMARY KEY("workspace_id","source","external_id")
);
--> statement-breakpoint
ALTER TABLE "post_imports" ADD CONSTRAINT "post_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_imports" ADD CONSTRAINT "post_imports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_imports_post_idx" ON "post_imports" USING btree ("post_id");