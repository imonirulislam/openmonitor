-- Incidents get a per-workspace sequential number so they can be addressed as
-- /incidents/42 rather than by uuid. Monitors, status pages and heartbeats
-- already had a slug for this; incidents had no natural key at all.
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "number" integer;
--> statement-breakpoint
-- Backfill in creation order so existing incidents read chronologically.
-- `id` breaks ties, keeping the result deterministic if two share a timestamp.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) AS n
  FROM "incidents"
)
UPDATE "incidents" i
SET "number" = numbered.n
FROM numbered
WHERE numbered.id = i.id AND i."number" IS NULL;
--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "number" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incidents_workspace_number_unique"
  ON "incidents" ("workspace_id","number");
