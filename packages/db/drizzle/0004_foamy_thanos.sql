ALTER TABLE "status_pages" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "primary_color" varchar(64);--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "custom_css" text;