/**
 * Weekly report of monitors whose p95 has crept up.
 *
 * Every other event in the system reacts to a state change. Slow degradation
 * never changes state — it just gets worse — so this is the one producer that
 * runs on a clock.
 *
 * It emits into the `events` outbox like everything else, with `monitorIds`
 * set to the drifting monitors so the notifier's existing routing delivers it
 * to whoever already subscribes to them. Nothing new is needed downstream.
 */
import { driftSamples } from "@openmonitor/clickhouse";
import { DRIFT_DIGEST_TASK, db, eq, getTaskRun, runTracked, schema } from "@openmonitor/db";
import { findDrift } from "@openmonitor/diagnostics";

const WINDOW_DAYS = 7;
const AGO_DAYS = 28;
const EVERY_MS = 7 * 24 * 60 * 60 * 1000;

export type DriftDigestResult = {
  workspaces: number;
  digests: number;
  monitors: number;
};

/** Runs at most weekly however often it's called, so a daily cron is fine. */
export async function runDriftDigest(force = false): Promise<DriftDigestResult | "skipped"> {
  const conn = db();
  if (!force) {
    const last = await getTaskRun(conn, DRIFT_DIGEST_TASK);
    if (last && Date.now() - last.lastRunAt.getTime() < EVERY_MS) return "skipped";
  }

  const result: DriftDigestResult = { workspaces: 0, digests: 0, monitors: 0 };
  await runTracked(conn, DRIFT_DIGEST_TASK, async () => {
    const monitors = await conn
      .select({
        id: schema.monitors.id,
        name: schema.monitors.name,
        workspaceId: schema.monitors.workspaceId,
      })
      .from(schema.monitors)
      .where(eq(schema.monitors.enabled, true));

    const byWorkspace = new Map<string, typeof monitors>();
    for (const m of monitors) {
      const list = byWorkspace.get(m.workspaceId);
      if (list) list.push(m);
      else byWorkspace.set(m.workspaceId, [m]);
    }

    for (const [workspaceId, list] of byWorkspace) {
      result.workspaces += 1;
      const findings = findDrift(
        await driftSamples(
          list.map((m) => m.id),
          WINDOW_DAYS,
          AGO_DAYS,
        ),
      );
      if (findings.length === 0) continue;

      const nameById = new Map(list.map((m) => [m.id, m.name]));
      await conn.insert(schema.events).values({
        workspaceId,
        type: "digest.drift",
        payload: {
          windowDays: WINDOW_DAYS,
          agoDays: AGO_DAYS,
          // Drives the notifier's channel routing.
          monitorIds: findings.map((f) => f.monitorId),
          monitors: findings.map((f) => ({
            id: f.monitorId,
            name: nameById.get(f.monitorId) ?? f.monitorId,
            recentP95: f.recentP95,
            earlierP95: f.earlierP95,
            pct: f.pct,
          })),
        },
      });
      result.digests += 1;
      result.monitors += findings.length;
    }

    return { ...result };
  });

  return result;
}
