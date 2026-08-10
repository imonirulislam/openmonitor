-- Probe locations become operator-level by default.
--
-- workspace_id NULL = a shared location the operator runs; every workspace can
-- select it when configuring a monitor. workspace_id set = a private location
-- belonging to one workspace, for probing inside that tenant's own network.
--
-- Without this, a newly created workspace has no probe location, so its
-- monitors are never checked and sit at 'unknown' with nothing explaining why.

ALTER TABLE "probe_locations" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint

-- The existing unique index is (workspace_id, region). In Postgres NULL is not
-- equal to itself, so it does not constrain shared rows at all — two shared
-- locations could both claim 'eu-west'. Partial indexes give each case its own
-- rule.
DROP INDEX IF EXISTS "probe_locations_workspace_region_unique";--> statement-breakpoint

CREATE UNIQUE INDEX "probe_locations_shared_region_unique"
  ON "probe_locations" ("region") WHERE "workspace_id" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "probe_locations_private_region_unique"
  ON "probe_locations" ("workspace_id", "region") WHERE "workspace_id" IS NOT NULL;--> statement-breakpoint

-- Existing locations were created before the distinction existed and are the
-- operator's own fleet, so promote them to shared. Only the first claimant of
-- each region can be promoted; the partial unique index rejects duplicates.
UPDATE "probe_locations" p
SET "workspace_id" = NULL
WHERE p."id" IN (
  SELECT DISTINCT ON ("region") "id" FROM "probe_locations" ORDER BY "region", "created_at"
);
