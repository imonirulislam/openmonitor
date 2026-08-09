ALTER TABLE "monitors" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "retry_delay_seconds" integer DEFAULT 5 NOT NULL;