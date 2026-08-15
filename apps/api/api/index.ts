import { handle } from "hono/vercel";
import { createApp } from "../src/app";

/**
 * Vercel entrypoint. `vercel.json` rewrites every path here, so this one
 * function serves the whole API and Hono does the routing — the alternative,
 * a file per route, would mean maintaining the route table twice.
 *
 * Node runtime, not edge: the Neon driver opens a WebSocket, and
 * `packages/auth` and the Slack signature check both use `node:crypto`.
 *
 * No `startRetentionScheduler()` here on purpose. A timer in a function that
 * is frozen after the response would never fire; set `RETENTION_ENABLED=off`
 * and let the cron entry in vercel.json call `/v1/system/scheduler/run`.
 */
export const config = { runtime: "nodejs" };

const app = createApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const HEAD = handle(app);
