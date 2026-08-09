-- Monitor kinds (http/tcp/dns), assertions, response-time thresholds, and
-- header-shape change. See docs/plans/monitor-kinds-and-assertions.md.

-- New enum for the monitor kind discriminator.
CREATE TYPE "public"."monitor_kind" AS ENUM('http', 'tcp', 'dns');--> statement-breakpoint

-- Append a new event type for performance-degraded notifications.
ALTER TYPE "public"."event_type" ADD VALUE 'monitor.degraded';--> statement-breakpoint

-- New columns. `kind` defaults to 'http' so existing rows stay valid.
ALTER TABLE "monitors" ADD COLUMN "kind" "monitor_kind" NOT NULL DEFAULT 'http';--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "host" varchar(255);--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "port" integer;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "assertions" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "degraded_after_ms" integer;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "follow_redirects" boolean NOT NULL DEFAULT true;--> statement-breakpoint

-- Convert headers from a JSON object (Record<string,string>) to a JSON array
-- of {key,value} entries. Drops empty objects to '[]'. Preserves key/value
-- pairs in alphabetical key order — pre-rework headers had no guaranteed
-- order anyway.
UPDATE "monitors" m
SET "headers" = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('key', kv.k, 'value', kv.v) ORDER BY kv.k)
    FROM jsonb_each_text(m."headers") AS kv(k, v)
  ),
  '[]'::jsonb
);--> statement-breakpoint

ALTER TABLE "monitors" ALTER COLUMN "headers" SET DEFAULT '[]'::jsonb;--> statement-breakpoint

-- Backfill assertions from expected_status so existing checker behavior is
-- preserved verbatim.
UPDATE "monitors"
SET "assertions" = jsonb_build_array(
  jsonb_build_object(
    'version', 'v1',
    'type', 'status',
    'compare', 'eq',
    'target', "expected_status"
  )
);--> statement-breakpoint

-- Make HTTP-only fields nullable so future tcp/dns rows aren't forced to
-- carry placeholder URLs/methods.
ALTER TABLE "monitors" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ALTER COLUMN "method" DROP NOT NULL;--> statement-breakpoint

-- Per-kind required-fields CHECK. Matches the drizzle definition.
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_kind_required_fields" CHECK (
  (kind = 'http' AND url IS NOT NULL AND method IS NOT NULL)
  OR (kind = 'tcp' AND host IS NOT NULL AND port IS NOT NULL)
  OR (kind = 'dns' AND host IS NOT NULL)
);
