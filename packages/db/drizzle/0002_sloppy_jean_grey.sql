-- Multi-workspace foundation. Manually edited from drizzle-kit's
-- auto-generated output: the original tried to ADD COLUMN ... NOT NULL on
-- existing data with no DEFAULT, which fails. Order here is:
--   1. Create the new tables (workspaces, workspace_members, status_pages,
--      status_page_monitors).
--   2. Insert a default workspace and bind every existing user to it.
--   3. Add `workspace_id` columns NULLABLE to all domain tables.
--   4. Backfill `workspace_id` to the default workspace for every existing row.
--   5. Flip `workspace_id` columns to NOT NULL and add foreign keys + indexes.
--   6. Create a default status page covering all existing monitors.
--   7. Drop the old single-tenant unique-on-slug index.

-- ---------------- 1. New tables ----------------

CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_unique" ON "workspaces" USING btree ("slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"custom_domain" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_pages_workspace_slug_unique" ON "status_pages" USING btree ("workspace_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "status_pages_custom_domain_unique" ON "status_pages" USING btree ("custom_domain");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "status_page_monitors" (
	"status_page_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "status_page_monitors_status_page_id_monitor_id_pk" PRIMARY KEY("status_page_id","monitor_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------------- 2. Default workspace + members ----------------

INSERT INTO "workspaces" ("id", "slug", "name")
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default workspace')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- Promote every existing user to admin of the default workspace. Single-tenant
-- behavior assumes there's only one user (the seeded admin); this is also fine
-- if there are several — they all get admin of the default workspace.
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT '00000000-0000-0000-0000-000000000001', "id", 'admin'
FROM "users"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ---------------- 3. Users: extra columns ----------------

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
--> statement-breakpoint

-- ---------------- 4. Add workspace_id columns nullable, then backfill ----------------

ALTER TABLE "monitors"              ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "monitor_runs"          ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "incidents"             ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "maintenances"          ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "events"                ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "audit_logs"            ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint

-- Backfill — every existing row joins the default workspace.
UPDATE "monitors"              SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "monitor_runs"          SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "incidents"             SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "maintenances"          SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "notification_channels" SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "events"                SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint
UPDATE "audit_logs"            SET "workspace_id" = '00000000-0000-0000-0000-000000000001' WHERE "workspace_id" IS NULL;
--> statement-breakpoint

-- ---------------- 5. Lock columns + add FKs ----------------

ALTER TABLE "monitors"              ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "monitor_runs"          ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "incidents"             ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "maintenances"          ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "events"                ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_logs"            ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "monitors" ADD CONSTRAINT "monitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ---------------- 6. Default status page + monitor links ----------------

INSERT INTO "status_pages" ("id", "workspace_id", "slug", "name", "description", "is_public")
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'default',
  'OpenMonitor',
  'Live status for your services',
  true
)
ON CONFLICT ("workspace_id", "slug") DO NOTHING;
--> statement-breakpoint

INSERT INTO "status_page_monitors" ("status_page_id", "monitor_id", "position")
SELECT
  '00000000-0000-0000-0000-000000000002',
  "id",
  ROW_NUMBER() OVER (ORDER BY "created_at") - 1
FROM "monitors"
WHERE "workspace_id" = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ---------------- 7. Indexes + final cleanup ----------------

DROP INDEX IF EXISTS "events_created_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "monitors_slug_unique";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_workspace_created_idx"     ON "events" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_workspace_idx"          ON "incidents" USING btree ("workspace_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenances_workspace_idx"       ON "maintenances" USING btree ("workspace_id","starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_runs_workspace_checked_idx" ON "monitor_runs" USING btree ("workspace_id","checked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitors_workspace_slug_unique" ON "monitors" USING btree ("workspace_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitors_workspace_idx"           ON "monitors" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_channels_workspace_idx" ON "notification_channels" USING btree ("workspace_id");
