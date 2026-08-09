import { sql } from "drizzle-orm";
import type { Database } from "./client";

/**
 * Installs Postgres triggers used by the runtime. Idempotent — safe to run
 * on every migrate.
 *
 * `monitors_changed` — fires `pg_notify('monitor_changed', <id>)` on INSERT,
 * UPDATE, or DELETE so the Go checker can react immediately to monitor config
 * changes instead of waiting for its next polling refresh.
 *
 * `installTriggerFunction` is split out because migrations 0013 and 0014 attach
 * triggers that `EXECUTE FUNCTION notify_monitor_changed()`. On a from-scratch
 * database the function must exist *before* `migrate()` runs, so `migrate.ts`
 * calls it first; `installTriggers` then re-runs it and attaches the triggers
 * against the final column set. Both are idempotent.
 */
export async function installTriggerFunction(db: Database): Promise<void> {
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION notify_monitor_changed() RETURNS trigger AS $$
    DECLARE
      payload TEXT;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        payload := OLD.id::text;
      ELSE
        payload := NEW.id::text;
      END IF;
      PERFORM pg_notify('monitor_changed', payload);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `));
}

export async function installTriggers(db: Database): Promise<void> {
  await installTriggerFunction(db);
  await db.execute(sql.raw(`
    -- INSERT/DELETE always fire. UPDATE only fires when probe-affecting columns
    -- change — last_checked_at / current_status are written on every probe and
    -- would otherwise trigger a refresh storm.
    DROP TRIGGER IF EXISTS monitors_changed_ins ON monitors;
    DROP TRIGGER IF EXISTS monitors_changed_upd ON monitors;
    DROP TRIGGER IF EXISTS monitors_changed_del ON monitors;
    DROP TRIGGER IF EXISTS monitors_changed ON monitors;

    CREATE TRIGGER monitors_changed_ins
    AFTER INSERT ON monitors
    FOR EACH ROW EXECUTE FUNCTION notify_monitor_changed();

    CREATE TRIGGER monitors_changed_del
    AFTER DELETE ON monitors
    FOR EACH ROW EXECUTE FUNCTION notify_monitor_changed();

    CREATE TRIGGER monitors_changed_upd
    AFTER UPDATE ON monitors
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
      OLD.retry_count             IS DISTINCT FROM NEW.retry_count             OR
      OLD.retry_delay_seconds     IS DISTINCT FROM NEW.retry_delay_seconds     OR
      OLD.auto_incident_threshold IS DISTINCT FROM NEW.auto_incident_threshold OR
      OLD.enabled                 IS DISTINCT FROM NEW.enabled                 OR
      OLD.slug                    IS DISTINCT FROM NEW.slug
    )
    EXECUTE FUNCTION notify_monitor_changed();
  `));
}
