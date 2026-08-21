/**
 * Retention sweep for the `events` outbox, plus the in-process timer
 * that fires it daily at `env.RETENTION_AT_UTC`.
 *
 * There are two ways to drive it, because there are two ways to deploy:
 *
 * - **Long-running container** — the timer below owns the schedule. Opt out
 *   with RETENTION_ENABLED=off if you have external cron, since a multi-replica
 *   deployment would otherwise sweep once per replica.
 * - **Serverless** — nothing stays resident to hold a timer, so an external
 *   scheduler POSTs `/v1/system/scheduler/run` instead. Set RETENTION_ENABLED=off
 *   there; the sweep itself is identical either way.
 *
 * Last-run state lives in `scheduled_task_runs`, not in module scope. Under
 * cron every invocation starts cold, and an in-memory `lastRun` would report
 * "never" indefinitely on a deployment sweeping correctly every night.
 *
 * Probe results are no longer swept here — they live in ClickHouse, where
 * retention is a TTL on the table. `RETENTION_RUN_DAYS` still names that
 * window, but it is applied at DDL time by @openmonitor/clickhouse.
 *
 * Mirrors the SQL in `packages/db/src/retention.ts`, kept in sync by hand so the
 * standalone script stays runnable from a release container without the API.
 */
import { affected, db, getTaskRun, RETENTION_TASK, runTracked, sql } from "@openmonitor/db";
import { env } from "./env";

const BATCH_SIZE = 5000;

export type RetentionRunResult = {
  startedAt: string;
  finishedAt: string;
  eventsDeleted: number;
  /** Populated when the sweep failed; never thrown out of the scheduler. */
  error?: string;
};

let timer: ReturnType<typeof setTimeout> | null = null;

/** Scheduler config plus the durable last-run record. */
export async function getRetentionStatus() {
  const run = await getTaskRun(db(), RETENTION_TASK);
  return {
    enabled: env.RETENTION_ENABLED === "on",
    runDays: env.RETENTION_RUN_DAYS,
    eventDays: env.RETENTION_EVENT_DAYS,
    atUtc: env.RETENTION_AT_UTC,
    lastRun: run
      ? {
          finishedAt: run.lastRunAt.toISOString(),
          durationMs: run.lastDurationMs,
          eventsDeleted: run.lastResult?.eventsDeleted ?? 0,
          error: run.lastError ?? undefined,
        }
      : null,
    // Derived from the clock, not from a resident timer — correct whether or
    // not this process is the one that will run it.
    nextRunAt: nextFireAt(new Date()).toISOString(),
  };
}

/**
 * One sweep. Same SQL as packages/db/src/retention.ts; we keep the two
 * places in sync by hand because the script is meant to be runnable from
 * a release container without booting the API.
 */
export async function runRetentionSweep(): Promise<RetentionRunResult> {
  const startedAt = new Date();
  let eventsDeleted = 0;

  // runTracked times the sweep, writes the outcome to scheduled_task_runs and
  // swallows the error. A cron endpoint that 500s just gets retried against
  // whatever broke; the next scheduled tick is the better recovery, and the
  // failure is still visible on the System page.
  const outcome = await runTracked(db(), RETENTION_TASK, async () => {
    const conn = db();
    // Batched so a large sweep doesn't hold locks for minutes.
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
      const deleted = affected(result);
      eventsDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    return { eventsDeleted };
  });

  const finishedAt = new Date();
  if (outcome.ok) {
    console.log(
      `retention: events=${eventsDeleted} (${finishedAt.getTime() - startedAt.getTime()}ms)`,
    );
  }
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    eventsDeleted,
    ...(outcome.ok ? {} : { error: outcome.error }),
  };
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
    const fireAt = nextFireAt(now);
    timer = setTimeout(async () => {
      await runRetentionSweep();
      schedule();
    }, fireAt.getTime() - now.getTime());
    console.log(`retention scheduler: next run at ${fireAt.toISOString()}`);
  };
  schedule();

  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
