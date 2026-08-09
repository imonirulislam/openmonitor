-- Multi-region probe support: schema only, no behavior change.
--
-- Adds:
--   * monitor_region_status    — per-(monitor, region) status. `monitors.current_status`
--     is a single scalar, so with more than one probe location every region would
--     overwrite it. This holds the per-region truth; the global value is reduced from it.
--   * monitors.region_policy   — how those per-region rows reduce to one status.
--     Default 'any' reproduces today's single-region behavior exactly.
--   * probe_locations          — a place probes run from. The token authenticates the
--     checker AND identifies its region, so region stops being a self-declared body field.
--     Only a hash is stored (scrypt, same format as packages/auth/src/password.ts).
--   * probe_location_monitors  — which monitors a location may report on. The join is
--     the authorization check.
--
-- Nothing reads these yet — probe ingest still writes monitors.current_status
-- directly. The backfill at the bottom seeds one 'local' row per monitor so the
-- table is never empty once the reduction starts reading it.

CREATE TYPE "monitor_region_policy" AS ENUM ('any', 'majority', 'all');--> statement-breakpoint

ALTER TABLE "monitors"
  ADD COLUMN "region_policy" "monitor_region_policy" NOT NULL DEFAULT 'any';--> statement-breakpoint

CREATE TABLE "monitor_region_status" (
  "monitor_id" uuid NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "region" varchar(50) NOT NULL,
  "status" "monitor_status" NOT NULL DEFAULT 'unknown',
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "last_checked_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monitor_region_status_monitor_id_region_pk" PRIMARY KEY ("monitor_id", "region")
);--> statement-breakpoint

CREATE INDEX "monitor_region_status_monitor_idx"
  ON "monitor_region_status" ("monitor_id");--> statement-breakpoint

CREATE TABLE "probe_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "region" varchar(50) NOT NULL,
  "token_hash" varchar(255) NOT NULL,
  "last_seen_at" timestamp with time zone,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX "probe_locations_workspace_region_unique"
  ON "probe_locations" ("workspace_id", "region");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_locations_token_hash_unique"
  ON "probe_locations" ("token_hash");--> statement-breakpoint
CREATE INDEX "probe_locations_workspace_idx"
  ON "probe_locations" ("workspace_id");--> statement-breakpoint

CREATE TABLE "probe_location_monitors" (
  "probe_location_id" uuid NOT NULL REFERENCES "probe_locations"("id") ON DELETE CASCADE,
  "monitor_id" uuid NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  CONSTRAINT "probe_location_monitors_probe_location_id_monitor_id_pk"
    PRIMARY KEY ("probe_location_id", "monitor_id")
);--> statement-breakpoint

CREATE INDEX "probe_location_monitors_monitor_idx"
  ON "probe_location_monitors" ("monitor_id");--> statement-breakpoint

-- Backfill: seed each existing monitor's current state as region 'local', which is
-- the default every probe result has carried so far (monitor_runs.region default).
-- Idempotent, so re-running the migration on a partially-migrated database is safe.
INSERT INTO "monitor_region_status"
  ("monitor_id", "region", "status", "consecutive_failures", "last_checked_at", "updated_at")
SELECT
  "id",
  'local',
  "current_status",
  "consecutive_failures",
  "last_checked_at",
  now()
FROM "monitors"
ON CONFLICT ("monitor_id", "region") DO NOTHING;
