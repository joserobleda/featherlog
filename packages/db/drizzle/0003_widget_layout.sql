ALTER TABLE "widget_settings" ADD COLUMN "meta_position" text DEFAULT 'above' NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_settings" ADD COLUMN "sticky_footer" boolean DEFAULT false NOT NULL;