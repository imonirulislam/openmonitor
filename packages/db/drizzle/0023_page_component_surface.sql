DO $$ BEGIN
  CREATE TYPE "page_component_surface" AS ENUM('status', 'metrics', 'both');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "page_components" ADD COLUMN IF NOT EXISTS "surface" "page_component_surface" DEFAULT 'status' NOT NULL;
