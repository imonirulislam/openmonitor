import "./load-env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";
import { startRetentionScheduler } from "./scheduler";

const server = serve({ fetch: createApp().fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

// Container entrypoint only. On serverless the retention schedule comes from
// an external cron hitting /v1/system/scheduler/run, because there's no
// process here to hold a timer between requests.
const stopRetention = startRetentionScheduler();

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  stopRetention();
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
