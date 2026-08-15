import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { scheduledTaskRuns } from "./schema";

export type TaskRun = {
  name: string;
  lastRunAt: Date;
  lastStatus: "ok" | "error";
  lastDurationMs: number;
  lastError: string | null;
  lastResult: Record<string, number> | null;
};

export type TaskCounts = Record<string, number>;

/**
 * Run a background sweep, time it, and record the outcome durably.
 *
 * Cron-triggered handlers have nowhere to keep this. The process that ran the
 * sweep is gone by the time anyone asks how it went, so the answer has to be in
 * the database or the operator sees "never ran" on a system that has been
 * running fine for a month.
 *
 * Deliberately does not rethrow. A cron endpoint that 500s tells the scheduler
 * to retry, and these sweeps are periodic — the next tick is a better recovery
 * than an immediate retry against whatever just broke. The failure is recorded
 * and returned to the caller so the response can still say what happened.
 */
export async function runTracked(
  conn: Database,
  name: string,
  task: () => Promise<TaskCounts>,
): Promise<{ ok: true; counts: TaskCounts } | { ok: false; error: string }> {
  const started = Date.now();
  try {
    const counts = await task();
    await record(conn, name, started, "ok", counts, null);
    return { ok: true, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await record(conn, name, started, "error", null, message);
    console.error(`${name}: ${message}`);
    return { ok: false, error: message };
  }
}

async function record(
  conn: Database,
  name: string,
  startedMs: number,
  status: "ok" | "error",
  counts: TaskCounts | null,
  error: string | null,
): Promise<void> {
  const now = new Date();
  const row = {
    name,
    lastRunAt: now,
    lastStatus: status,
    lastDurationMs: Date.now() - startedMs,
    lastError: error,
    lastResult: counts,
    updatedAt: now,
  };
  await conn
    .insert(scheduledTaskRuns)
    .values(row)
    .onConflictDoUpdate({ target: scheduledTaskRuns.name, set: row });
}

/** Last recorded run of a task, or null if it has never run here. */
export async function getTaskRun(conn: Database, name: string): Promise<TaskRun | null> {
  const [row] = await conn
    .select()
    .from(scheduledTaskRuns)
    .where(eq(scheduledTaskRuns.name, name))
    .limit(1);
  return row ?? null;
}
