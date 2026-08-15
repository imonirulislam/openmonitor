import "./load-env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";
import { sweepHeartbeats } from "./heartbeat-sweeper";
import { sweepProbeLocations } from "./location-sweeper";
import { processBatch } from "./worker";

/**
 * Two ways to drive the notifier, one process.
 *
 * The HTTP server is always on: it serves /health for the platform and the
 * /cron/* endpoints for a hosted scheduler. The polling loop is opt-out via
 * NOTIFIER_POLL, because a long-running container should pace itself while a
 * serverless deployment has nothing resident to do the pacing.
 *
 * Running both at once would just mean the loop and the cron trigger race for
 * the same batch, which SKIP LOCKED already makes safe — but it's wasted work,
 * so pick one per deployment.
 */
let stopping = false;
let lastSweep = 0;

async function loop() {
  while (!stopping) {
    try {
      const { processed, failed } = await processBatch();
      if (processed > 0 || failed > 0) {
        console.log(`notifier: processed=${processed} failed=${failed}`);
      }
      const now = Date.now();
      if (now - lastSweep >= env.HEARTBEAT_SWEEP_MS) {
        lastSweep = now;
        const { tripped } = await sweepHeartbeats();
        if (tripped > 0) console.log(`notifier: heartbeats tripped=${tripped}`);
        const { silenced, recovered } = await sweepProbeLocations(
          env.LOCATION_SILENT_GRACE_SECONDS,
        );
        if (silenced > 0 || recovered > 0) {
          console.log(`notifier: locations silenced=${silenced} recovered=${recovered}`);
        }
      }
    } catch (err) {
      console.error("notifier batch error:", err);
    }
    await sleep(env.POLL_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = serve({ fetch: createApp().fetch, port: env.PORT }, (info) => {
  console.log(`notifier listening on http://localhost:${info.port}`);
});

if (env.NOTIFIER_POLL === "on") {
  console.log(`notifier polling, interval=${env.POLL_INTERVAL_MS}ms`);
  loop();
} else {
  console.log("notifier polling disabled (NOTIFIER_POLL=off) — waiting for /cron/* calls");
}

const shutdown = (signal: string) => {
  console.log(`${signal} received, stopping notifier`);
  stopping = true;
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
