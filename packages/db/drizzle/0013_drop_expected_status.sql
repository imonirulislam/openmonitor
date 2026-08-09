-- PR-5 cleanup: drop the legacy `expected_status` column. The pre-PR-3
-- checker was the only remaining reader; PR-3 swapped it for the
-- assertion-based reduction. The column was kept one release for back-compat;
-- this migration removes it. Also refreshes the `monitors_changed_upd`
-- trigger's WHEN clause to drop expected_status and pick up the new
-- per-kind / assertions / response-time columns added in PR-1.

-- Drop the trigger first; its WHEN clause references expected_status so the
-- column drop would otherwise fail with a dependency error.
DROP TRIGGER IF EXISTS "monitors_changed_upd" ON "monitors";--> statement-breakpoint

ALTER TABLE "monitors" DROP COLUMN "expected_status";--> statement-breakpoint
CREATE TRIGGER "monitors_changed_upd"
AFTER UPDATE ON "monitors"
FOR EACH ROW
WHEN (
  OLD.kind                IS DISTINCT FROM NEW.kind                OR
  OLD.url                 IS DISTINCT FROM NEW.url                 OR
  OLD.method              IS DISTINCT FROM NEW.method              OR
  OLD.host                IS DISTINCT FROM NEW.host                OR
  OLD.port                IS DISTINCT FROM NEW.port                OR
  OLD.headers             IS DISTINCT FROM NEW.headers             OR
  OLD.body                IS DISTINCT FROM NEW.body                OR
  OLD.assertions          IS DISTINCT FROM NEW.assertions          OR
  OLD.degraded_after_ms   IS DISTINCT FROM NEW.degraded_after_ms   OR
  OLD.follow_redirects    IS DISTINCT FROM NEW.follow_redirects    OR
  OLD.interval_seconds    IS DISTINCT FROM NEW.interval_seconds    OR
  OLD.timeout_ms          IS DISTINCT FROM NEW.timeout_ms          OR
  OLD.retry_count         IS DISTINCT FROM NEW.retry_count         OR
  OLD.retry_delay_seconds IS DISTINCT FROM NEW.retry_delay_seconds OR
  OLD.enabled             IS DISTINCT FROM NEW.enabled             OR
  OLD.slug                IS DISTINCT FROM NEW.slug
)
EXECUTE FUNCTION notify_monitor_changed();
