import { db, runTracked } from "@openmonitor/db";
import { Hono } from "hono";
import { env } from "./env";
import { sweepHeartbeats } from "./heartbeat-sweeper";
import { sweepProbeLocations } from "./location-sweeper";
import { processBatch } from "./worker";

export const DRAIN_TASK = "notifier.drain";
export const SWEEP_TASK = "notifier.sweep";

/**
 * HTTP face of the notifier, so a hosted scheduler can drive it.
 *
 * The polling loop in index.ts is the right shape for a container that stays
 * up. Serverless has no such process — the work has to be pulled by something
 * external, one invocation at a time. Both call the same functions; this file
 * only adds the trigger.
 *
 * Endpoints are safe to call concurrently. The outbox claim uses
 * FOR UPDATE SKIP LOCKED, and the sweeps are guarded by `silent_alerted_at` /
 * `current_status`, so two overlapping cron invocations do less work rather
 * than duplicate work.
 */
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "notifier" }));

  app.use("/cron/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  /** One outbox batch. Cron this at your shortest acceptable alert latency. */
  app.post("/cron/drain", async (c) => {
    const outcome = await runTracked(db(), DRAIN_TASK, async () => {
      const { processed, failed } = await processBatch();
      return { processed, failed };
    });
    return outcome.ok ? c.json(outcome.counts) : c.json({ error: outcome.error }, 500);
  });

  /**
   * Heartbeats and probe locations. Slower cadence than the drain — both scan
   * every enabled row, and neither needs sub-minute resolution.
   */
  app.post("/cron/sweep", async (c) => {
    const outcome = await runTracked(db(), SWEEP_TASK, async () => {
      const { tripped } = await sweepHeartbeats();
      const { silenced, recovered } = await sweepProbeLocations(env.LOCATION_SILENT_GRACE_SECONDS);
      return { tripped, silenced, recovered };
    });
    return outcome.ok ? c.json(outcome.counts) : c.json({ error: outcome.error }, 500);
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error("notifier error:", err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
