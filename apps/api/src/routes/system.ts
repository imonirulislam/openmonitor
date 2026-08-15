import { db, rows, schema, sql } from "@openmonitor/db";
import { Hono } from "hono";
import { env } from "../env";
import { apiKeyAuth } from "../middleware/api-key";
import { getRetentionStatus, runRetentionSweep } from "../scheduler";

/**
 * System / housekeeping endpoints. Protected by the same probe API key as
 * the checker endpoints — these are operational, not user-facing. The
 * dashboard's admin-only "System status" page calls these to render the
 * retention scheduler state and basic checker telemetry.
 */
export const systemRoutes = new Hono();

systemRoutes.use("/v1/system/*", apiKeyAuth([env.PROBE_API_KEY, env.CRON_SECRET]));

/** Returns retention scheduler config + last-run summary + db row counts. */
systemRoutes.get("/v1/system/scheduler", async (c) => {
  const conn = db();
  const counts = await conn.execute(sql`
    SELECT
      (SELECT count(*) FROM monitor_runs) AS monitor_runs,
      (SELECT count(*) FROM events) AS events,
      (SELECT count(*) FROM events WHERE status = 'pending') AS events_pending,
      (SELECT count(*) FROM events WHERE status = 'failed') AS events_failed
  `);
  const row = rows<{
    monitor_runs: string;
    events: string;
    events_pending: string;
    events_failed: string;
  }>(counts)[0];
  return c.json({
    retention: await getRetentionStatus(),
    counts: row
      ? {
          monitorRuns: Number(row.monitor_runs),
          events: Number(row.events),
          eventsPending: Number(row.events_pending),
          eventsFailed: Number(row.events_failed),
        }
      : null,
  });
});

/**
 * Trigger a retention sweep right now. Returns the run summary.
 *
 * GET as well as POST: the dashboard posts, but hosted schedulers issue GET and
 * generally can't be told otherwise (Vercel Cron always does).
 */
systemRoutes.on(["GET", "POST"], "/v1/system/scheduler/run", async (c) => {
  const result = await runRetentionSweep();
  return c.json(result);
});

/**
 * Light checker telemetry. We don't talk to the Go checker process; we
 * derive its health from the freshness of the most recent probe per
 * monitor. A monitor whose `last_checked_at` is older than ~3× its
 * configured interval suggests the checker is stuck or disconnected.
 */
systemRoutes.get("/v1/system/checker", async (c) => {
  const conn = db();
  const rows = await conn
    .select({
      id: schema.monitors.id,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
      kind: schema.monitors.kind,
      enabled: schema.monitors.enabled,
      currentStatus: schema.monitors.currentStatus,
      lastCheckedAt: schema.monitors.lastCheckedAt,
      intervalSeconds: schema.monitors.intervalSeconds,
      consecutiveFailures: schema.monitors.consecutiveFailures,
    })
    .from(schema.monitors);
  const now = Date.now();
  const monitors = rows.map((m) => {
    const sinceMs = m.lastCheckedAt ? now - m.lastCheckedAt.getTime() : null;
    const overdueAfterMs = m.intervalSeconds * 1000 * 3;
    return {
      id: m.id,
      slug: m.slug,
      name: m.name,
      kind: m.kind,
      enabled: m.enabled,
      currentStatus: m.currentStatus,
      lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
      intervalSeconds: m.intervalSeconds,
      consecutiveFailures: m.consecutiveFailures,
      lastCheckedAgoMs: sinceMs,
      overdue: sinceMs !== null && sinceMs > overdueAfterMs,
    };
  });
  // The checker is "healthy" if every enabled monitor has a recent probe.
  const enabled = monitors.filter((m) => m.enabled);
  const overdue = enabled.filter((m) => m.overdue || m.lastCheckedAt === null);
  return c.json({
    healthy: overdue.length === 0,
    enabledCount: enabled.length,
    overdueCount: overdue.length,
    monitors,
  });
});
