-- Slice A: replace status_page_monitors with page_components + page_component_groups.
-- Existing monitor links migrate in as type='monitor' rows; afterward the old table is dropped.

DO $$ BEGIN
  CREATE TYPE "page_component_type" AS ENUM('monitor', 'static');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_component_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_page_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"default_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_page_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "page_component_type" DEFAULT 'monitor' NOT NULL,
	"monitor_id" uuid,
	"group_id" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"static_status" "monitor_status" DEFAULT 'up',
	"position" integer DEFAULT 0 NOT NULL,
	"group_position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Either backed by a monitor or a free-form static component, never both.
	CONSTRAINT "page_components_type_monitor_check" CHECK (
	  (type = 'monitor' AND monitor_id IS NOT NULL) OR
	  (type = 'static' AND monitor_id IS NULL)
	)
);
--> statement-breakpoint

ALTER TABLE "page_component_groups" ADD CONSTRAINT "page_component_groups_status_page_id_status_pages_id_fk"
  FOREIGN KEY ("status_page_id") REFERENCES "status_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "page_components" ADD CONSTRAINT "page_components_status_page_id_status_pages_id_fk"
  FOREIGN KEY ("status_page_id") REFERENCES "status_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_components" ADD CONSTRAINT "page_components_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_components" ADD CONSTRAINT "page_components_monitor_id_monitors_id_fk"
  FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "page_components" ADD CONSTRAINT "page_components_group_id_page_component_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "page_component_groups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "page_component_groups_page_idx" ON "page_component_groups" ("status_page_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_components_page_idx" ON "page_components" ("status_page_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_components_group_idx" ON "page_components" ("group_id","group_position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_components_page_monitor_unique"
  ON "page_components" ("status_page_id","monitor_id") WHERE "monitor_id" IS NOT NULL;
--> statement-breakpoint

-- Migrate existing status_page_monitors rows into page_components. Inherits
-- name and description from the linked monitor; admins can override later.
INSERT INTO "page_components"
  ("status_page_id", "workspace_id", "type", "monitor_id", "name", "description", "position")
SELECT
  spm."status_page_id",
  m."workspace_id",
  'monitor'::page_component_type,
  spm."monitor_id",
  m."name",
  m."description",
  spm."position"
FROM "status_page_monitors" spm
JOIN "monitors" m ON m."id" = spm."monitor_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "status_page_monitors";
