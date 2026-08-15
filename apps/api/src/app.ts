import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { badgeRoutes } from "./routes/badges";
import { feedRoutes } from "./routes/feed";
import { heartbeatRoutes } from "./routes/heartbeats";
import { probeRoutes } from "./routes/probes";
import { statusRoutes } from "./routes/status";
import { systemRoutes } from "./routes/system";
import { unlockRoutes } from "./routes/unlock";
import { webhookRoutes } from "./routes/webhooks";

/**
 * The routes, with no server attached.
 *
 * Kept separate from `index.ts` so the same app can be mounted two ways: a
 * listening Node server for containers, and a request handler for serverless.
 * Nothing here may bind a port, open a long-lived connection or start a timer —
 * that's the caller's job, and the serverless caller can't do any of it.
 */
export function createApp() {
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

  return app;
}
