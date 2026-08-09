import "./load-env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { badgeRoutes } from "./routes/badges";
import { feedRoutes } from "./routes/feed";
import { heartbeatRoutes } from "./routes/heartbeats";
import { probeRoutes } from "./routes/probes";
import { statusRoutes } from "./routes/status";
import { systemRoutes } from "./routes/system";
import { unlockRoutes } from "./routes/unlock";
import { webhookRoutes } from "./routes/webhooks";
import { startRetentionScheduler } from "./scheduler";

const app = new Hono();

app.use(logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "api" }));
app.get("/ready", (c) => c.json({ ok: true }));

app.route("/", statusRoutes);
app.route("/", probeRoutes);
app.route("/", badgeRoutes);
app.route("/", feedRoutes);
app.route("/", heartbeatRoutes);
app.route("/", unlockRoutes);
app.route("/", webhookRoutes);
app.route("/", systemRoutes);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "internal error" }, 500);
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

const stopRetention = startRetentionScheduler();

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  stopRetention();
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
