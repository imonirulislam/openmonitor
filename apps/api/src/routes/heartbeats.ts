import { Hono } from "hono";
import { db, eq, schema } from "@openmonitor/db";

export const heartbeatRoutes = new Hono();

/**
 * Push-based heartbeat ingest. Cron jobs hit this endpoint on their normal
 * schedule (the same way they'd hit a healthcheck.io URL). Updates
 * last_ping_at and flips status to "up". The sweeper in apps/notifier flips
 * to "down" when pings go missing.
 *
 * No auth beyond the opaque token — the token is the credential. We accept
 * GET and POST so curl/wget cron one-liners are easy.
 */
heartbeatRoutes.all("/v1/heartbeats/:token", async (c) => {
  const token = c.req.param("token");
  if (c.req.method !== "GET" && c.req.method !== "POST" && c.req.method !== "HEAD") {
    return c.json({ error: "method not allowed" }, 405);
  }

  const conn = db();
  const [hb] = await conn
    .select({
      id: schema.heartbeatMonitors.id,
      workspaceId: schema.heartbeatMonitors.workspaceId,
      enabled: schema.heartbeatMonitors.enabled,
      currentStatus: schema.heartbeatMonitors.currentStatus,
    })
    .from(schema.heartbeatMonitors)
    .where(eq(schema.heartbeatMonitors.token, token))
    .limit(1);

  if (!hb) return c.json({ error: "unknown heartbeat" }, 404);
  if (!hb.enabled) return c.json({ ok: true, ignored: true });

  const previousStatus = hb.currentStatus;
  const now = new Date();

  await conn.transaction(async (tx) => {
    await tx
      .update(schema.heartbeatMonitors)
      .set({ lastPingAt: now, currentStatus: "up", updatedAt: now })
      .where(eq(schema.heartbeatMonitors.id, hb.id));

    // Recovery event when transitioning out of "down".
    if (previousStatus === "down") {
      await tx.insert(schema.events).values({
        workspaceId: hb.workspaceId,
        type: "monitor.recovered",
        payload: {
          monitor: { id: hb.id, slug: "(heartbeat)", name: "(heartbeat)", url: "" },
          region: "heartbeat",
          downForMs: null,
          checkedAt: now.toISOString(),
        },
      });
    }
  });

  return c.json({ ok: true });
});
