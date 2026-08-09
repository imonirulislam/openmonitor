ALTER TABLE "maintenances" ADD COLUMN "recurrence_rule" varchar(500);--> statement-breakpoint
ALTER TABLE "maintenances" ADD COLUMN "recurrence_until" timestamp with time zone;