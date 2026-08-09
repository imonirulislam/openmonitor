-- Auto-incident on N consecutive `down` probes.
--
-- Adds:
--   * monitors.auto_incident_threshold — null/0 = disabled. When the
--     consecutive_failures counter crosses this value, the probes route
--     auto-creates a public incident (and auto-resolves it on recovery).
--   * monitors.consecutive_failures — running counter the probes route
--     bumps on every result (++ on down, 0 on up). Persisted so it
--     survives checker restarts.
--   * incidents.auto_created — flag used to find which open incident we
--     should auto-resolve on recovery (we never auto-resolve a manually-
--     created incident).

ALTER TABLE "monitors"
  ADD COLUMN "auto_incident_threshold" integer;--> statement-breakpoint
ALTER TABLE "monitors"
  ADD COLUMN "consecutive_failures" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "incidents"
  ADD COLUMN "auto_created" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Refresh the monitors_changed_upd trigger to include the new threshold
-- column. consecutive_failures is excluded — the probes route bumps it
-- every probe, and we don't want each bump triggering a checker
-- reconfiguration.
DROP TRIGGER IF EXISTS "monitors_changed_upd" ON "monitors";--> statement-breakpoint
CREATE TRIGGER "monitors_changed_upd"
AFTER UPDATE ON "monitors"
FOR EACH ROW
WHEN (
  OLD.kind                    IS DISTINCT FROM NEW.kind                    OR
  OLD.url                     IS DISTINCT FROM NEW.url                     OR
  OLD.method                  IS DISTINCT FROM NEW.method                  OR
  OLD.host                    IS DISTINCT FROM NEW.host                    OR
  OLD.port                    IS DISTINCT FROM NEW.port                    OR
  OLD.headers                 IS DISTINCT FROM NEW.headers                 OR
  OLD.body                    IS DISTINCT FROM NEW.body                    OR
  OLD.assertions              IS DISTINCT FROM NEW.assertions              OR
  OLD.degraded_after_ms       IS DISTINCT FROM NEW.degraded_after_ms       OR
  OLD.follow_redirects        IS DISTINCT FROM NEW.follow_redirects        OR
  OLD.interval_seconds        IS DISTINCT FROM NEW.interval_seconds        OR
  OLD.timeout_ms              IS DISTINCT FROM NEW.timeout_ms              OR
  OLD.retry_count             IS DISTINCT FROM NEW.retry_count             OR
  OLD.retry_delay_seconds     IS DISTINCT FROM NEW.retry_delay_seconds     OR
  OLD.auto_incident_threshold IS DISTINCT FROM NEW.auto_incident_threshold OR
  OLD.enabled                 IS DISTINCT FROM NEW.enabled                 OR
  OLD.slug                    IS DISTINCT FROM NEW.slug
)
EXECUTE FUNCTION notify_monitor_changed();
