/**
 * Internal daily scheduler that sweeps `monitor_runs` and `events` once per
 * day at `env.RETENTION_AT_UTC`. Mirrors the logic in
 * `packages/db/src/retention.ts` so both run the same SQL — the standalone
 * script remains usable for one-shot/manual runs from cron, and the API
 * can act as the scheduler in deployments without external cron.
 *
 * State is persisted in-memory only: on cold start we run the sweep
 * immediately if the last run is older than today's scheduled time, and
 * thereafter on a setTimeout chain. A multi-replica deployment should
 * still favor an external cron (only one runs to avoid duplicate work),
 * which is why this is opt-out via RETENTION_ENABLED=off.
 */
import { db, sql } from "@openmonitor/db";
import { env } from "./env";

const BATCH_SIZE = 5000;

export type RetentionRunResult = {
  startedAt: string;
  finishedAt: string;
  monitorRunsDeleted: number;
  eventsDeleted: number;
  /** Populated when the sweep failed; never thrown out of the scheduler. */
  error?: string;
};

let lastRun: RetentionRunResult | null = null;
let nextRunAt: Date | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Snapshot of scheduler state for the /v1/system/scheduler endpoint. */
export function getRetentionStatus() {
  return {
    enabled: env.RETENTION_ENABLED === "on",
    runDays: env.RETENTION_RUN_DAYS,
    eventDays: env.RETENTION_EVENT_DAYS,
    atUtc: env.RETENTION_AT_UTC,
    lastRun,
    nextRunAt: nextRunAt?.toISOString() ?? null,
  };
}

/**
 * One sweep. Same SQL as packages/db/src/retention.ts; we keep the two
 * places in sync by hand because the script is meant to be runnable from
 * a release container without booting the API.
 */
export async function runRetentionSweep(): Promise<RetentionRunResult> {
  const startedAt = new Date();
  let monitorRunsDeleted = 0;
  let eventsDeleted = 0;
  try {
    const conn = db();
    while (true) {
      const result = await conn.execute(sql`
        WITH victims AS (
          SELECT id FROM monitor_runs
          WHERE checked_at < now() - (${env.RETENTION_RUN_DAYS}::int * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM monitor_runs WHERE id IN (SELECT id FROM victims)
      `);
      const deleted = (result as unknown as { count?: number }).count ?? 0;
      monitorRunsDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    while (true) {
      const result = await conn.execute(sql`
        WITH victims AS (
          SELECT id FROM events
          WHERE status = 'sent'
            AND created_at < now() - (${env.RETENTION_EVENT_DAYS}::int * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM events WHERE id IN (SELECT id FROM victims)
      `);
      const deleted = (result as unknown as { count?: number }).count ?? 0;
      eventsDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    const finishedAt = new Date();
    const result: RetentionRunResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      monitorRunsDeleted,
      eventsDeleted,
    };
    lastRun = result;
    console.log(
      `retention: monitor_runs=${monitorRunsDeleted}, events=${eventsDeleted} ` +
        `(${finishedAt.getTime() - startedAt.getTime()}ms)`,
    );
    return result;
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    const result: RetentionRunResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      monitorRunsDeleted,
      eventsDeleted,
      error: message,
    };
    lastRun = result;
    console.error("retention sweep failed:", message);
    return result;
  }
}

/** Compute the next firing time at HH:MM UTC, on or after `now`. */
function nextFireAt(now: Date): Date {
  const [hh, mm] = env.RETENTION_AT_UTC.split(":").map((s) => Number.parseInt(s, 10));
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

/**
 * Boot the in-process daily scheduler. Idempotent — calling twice is a
 * no-op. Returns a `stop()` cleanup for tests / SIGTERM.
 */
export function startRetentionScheduler() {
  if (env.RETENTION_ENABLED !== "on") {
    console.log("retention scheduler disabled (RETENTION_ENABLED=off)");
    return () => {};
  }
  if (timer) return () => clearTimeout(timer!);

  const schedule = () => {
    const now = new Date();
    nextRunAt = nextFireAt(now);
    const delay = nextRunAt.getTime() - now.getTime();
    timer = setTimeout(async () => {
      await runRetentionSweep();
      schedule();
    }, delay);
    console.log(`retention scheduler: next run at ${nextRunAt.toISOString()}`);
  };
  schedule();

  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
