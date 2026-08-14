import "./load-env";
import { sweepHeartbeats } from "./heartbeat-sweeper";
import { sweepProbeLocations } from "./location-sweeper";
import { processBatch } from "./worker";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
// Sweep heartbeats on a slower cadence — they only need to trip on the order
// of seconds-late, and the query touches every enabled heartbeat row.
const HEARTBEAT_SWEEP_MS = Number(process.env.HEARTBEAT_SWEEP_MS ?? 30000);
// Grace added on top of a location's own derived threshold (two check cycles of
// its slowest assigned monitor). Absorbs probe jitter and slow responses.
const LOCATION_SILENT_GRACE_SECONDS = Number(process.env.LOCATION_SILENT_GRACE_SECONDS ?? 60);

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
      if (now - lastSweep >= HEARTBEAT_SWEEP_MS) {
        lastSweep = now;
        const { tripped } = await sweepHeartbeats();
        if (tripped > 0) console.log(`notifier: heartbeats tripped=${tripped}`);
        const { silenced, recovered } = await sweepProbeLocations(LOCATION_SILENT_GRACE_SECONDS);
        if (silenced > 0 || recovered > 0) {
          console.log(`notifier: locations silenced=${silenced} recovered=${recovered}`);
        }
      }
    } catch (err) {
      console.error("notifier batch error:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const shutdown = (sig: string) => {
  console.log(`${sig} received, stopping notifier`);
  stopping = true;
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(`notifier started, poll=${POLL_INTERVAL_MS}ms`);
loop();
