/**
 * Retention sweeper. Trims tables that grow without bound:
 *
 *   - monitor_runs older than RETENTION_RUN_DAYS (default 180)
 *   - events older than RETENTION_EVENT_DAYS (default 90) AND already 'sent'
 *
 * Idempotent. Run from cron, e.g.:
 *   0 4 * * *  cd /app && bun run --filter @openmonitor/db retention
 *
 * One of three ways this sweep runs — the API has an in-process timer and a
 * cron endpoint doing the same work. All three record under RETENTION_TASK, so
 * the System page shows the real last run whichever one fired. Exits non-zero
 * on failure so cron reports it.
 *
 * The SQL is duplicated in apps/api/src/scheduler.ts and kept in sync by hand,
 * so this stays runnable from a release container without booting the API.
 *
 * We delete in batches so a multi-million-row sweep doesn't block writes for
 * minutes — Postgres holds row locks for the duration of the DELETE.
 */
import "./load-env";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { configureNeon } from "./neon";
import { affected } from "./raw";
import { RETENTION_TASK, runTracked } from "./scheduled-tasks";
import * as schema from "./schema";

const BATCH_SIZE = 5000;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");

  const runDays = Number(process.env.RETENTION_RUN_DAYS ?? 180);
  const eventDays = Number(process.env.RETENTION_EVENT_DAYS ?? 90);

  configureNeon();
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  console.log(`Retention sweep: monitor_runs > ${runDays}d, sent events > ${eventDays}d`);

  let totalRuns = 0;
  let totalEvents = 0;

  // Recorded under the same task name the API uses. Whichever path actually
  // runs the sweep, the System page has to show it — a cron'd `db:retention`
  // that swept fine but left the dashboard reporting "never" is exactly the
  // confusion the table exists to prevent.
  const outcome = await runTracked(db, RETENTION_TASK, async () => {
    while (true) {
      const result = await db.execute(sql`
        WITH victims AS (
          SELECT id FROM monitor_runs
          WHERE checked_at < now() - (${runDays}::int * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM monitor_runs WHERE id IN (SELECT id FROM victims)
      `);
      const deleted = affected(result);
      totalRuns += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    while (true) {
      const result = await db.execute(sql`
        WITH victims AS (
          SELECT id FROM events
          WHERE status = 'sent'
            AND created_at < now() - (${eventDays}::int * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM events WHERE id IN (SELECT id FROM victims)
      `);
      const deleted = affected(result);
      totalEvents += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    return { monitorRunsDeleted: totalRuns, eventsDeleted: totalEvents };
  });

  console.log(`monitor_runs: deleted ${totalRuns} rows`);
  console.log(`events: deleted ${totalEvents} rows`);

  await pool.end();
  if (!outcome.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Retention failed:", err);
  process.exit(1);
});
