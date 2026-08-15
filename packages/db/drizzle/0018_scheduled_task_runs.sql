DO $$ BEGIN
  CREATE TYPE "scheduled_task_status" AS ENUM ('ok', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_task_runs" (
  "name" varchar(64) PRIMARY KEY NOT NULL,
  "last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_status" "scheduled_task_status" NOT NULL,
  "last_duration_ms" integer NOT NULL,
  "last_error" text,
  "last_result" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
