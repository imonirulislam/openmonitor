import { zValidator } from "@hono/zod-validator";
import { and, db, eq, ne, schema } from "@openmonitor/db";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { apiKeyAuth } from "../middleware/api-key";

const probeSchema = z.object({
  monitorId: z.string().uuid(),
  status: z.enum(["up", "down", "degraded", "unknown"]),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  // Per-phase latencies. All optional + nullable so older checkers and
  // non-HTTP probes (heartbeat, future TCP/DNS) keep working.
  latencyDnsMs: z.number().int().nullable().optional(),
  latencyConnectMs: z.number().int().nullable().optional(),
  latencyTlsMs: z.number().int().nullable().optional(),
  latencyTtfbMs: z.number().int().nullable().optional(),
  latencyTransferMs: z.number().int().nullable().optional(),
  region: z.string().min(1).max(50).default("local"),
  error: z.string().nullable(),
  checkedAt: z.string().datetime().optional(),
});

/** Format a duration in ms as a human-readable string (e.g. "12m", "1h 5m"). */
function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
}

export const probeRoutes = new Hono();

probeRoutes.use("/v1/probes/*", apiKeyAuth(env.PROBE_API_KEY));

probeRoutes.post("/v1/probes/results", zValidator("json", probeSchema), async (c) => {
  const body = c.req.valid("json");
  const conn = db();

  const [monitor] = await conn
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, body.monitorId))
    .limit(1);

  if (!monitor) return c.json({ error: "monitor not found" }, 404);

  const checkedAt = body.checkedAt ? new Date(body.checkedAt) : new Date();
  const previousStatus = monitor.currentStatus;
  // Auto-incident bookkeeping: bump on `down`, reset on anything else.
  const newConsecutiveFailures = body.status === "down" ? monitor.consecutiveFailures + 1 : 0;
  const threshold = monitor.autoIncidentThreshold ?? 0;

  // Only auto-create a public incident if (a) threshold is enabled, (b) this
  // probe was down, (c) the counter has reached the threshold, and (d)
  // there isn't already an open auto-incident for this monitor. Condition
  // (d) is what enforces "exactly one incident per outage" without
  // requiring an exact-crossing comparison — that way enabling the
  // threshold mid-outage (counter already past threshold) correctly fires
  // on the next failed probe.
  const couldOpenAutoIncident =
    threshold > 0 && body.status === "down" && newConsecutiveFailures >= threshold;
  let shouldOpenAutoIncident = false;
  if (couldOpenAutoIncident) {
    const open = await conn
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .innerJoin(
        schema.incidentMonitors,
        eq(schema.incidentMonitors.incidentId, schema.incidents.id),
      )
      .where(
        and(
          eq(schema.incidents.workspaceId, monitor.workspaceId),
          eq(schema.incidentMonitors.monitorId, monitor.id),
          eq(schema.incidents.autoCreated, true),
          ne(schema.incidents.status, "resolved"),
        ),
      )
      .limit(1);
    shouldOpenAutoIncident = open.length === 0;
  }
  const shouldResolveAutoIncident =
    body.status === "up" && (previousStatus === "down" || previousStatus === "degraded");

  await conn.transaction(async (tx) => {
    await tx.insert(schema.monitorRuns).values({
      monitorId: body.monitorId,
      workspaceId: monitor.workspaceId,
      status: body.status,
      statusCode: body.statusCode,
      latencyMs: body.latencyMs,
      latencyDnsMs: body.latencyDnsMs ?? null,
      latencyConnectMs: body.latencyConnectMs ?? null,
      latencyTlsMs: body.latencyTlsMs ?? null,
      latencyTtfbMs: body.latencyTtfbMs ?? null,
      latencyTransferMs: body.latencyTransferMs ?? null,
      region: body.region,
      error: body.error,
      checkedAt,
    });

    await tx
      .update(schema.monitors)
      .set({
        currentStatus: body.status,
        lastCheckedAt: checkedAt,
        consecutiveFailures: newConsecutiveFailures,
        updatedAt: new Date(),
      })
      .where(eq(schema.monitors.id, body.monitorId));

    // Status-transition events. Reduction matches openstatus's pattern:
    //   prev != down                  && next == down     → monitor.down
    //   prev != degraded && prev != down && next == degraded → monitor.degraded
    //   prev ∈ {down, degraded}       && next == up       → monitor.recovered
    const monitorPayload = {
      id: monitor.id,
      slug: monitor.slug,
      name: monitor.name,
      url: monitor.url,
    };
    if (previousStatus !== "down" && body.status === "down") {
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.down",
        payload: {
          monitor: monitorPayload,
          region: body.region,
          error: body.error,
          statusCode: body.statusCode,
          checkedAt: checkedAt.toISOString(),
        },
      });
    } else if (
      previousStatus !== "degraded" &&
      previousStatus !== "down" &&
      body.status === "degraded"
    ) {
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.degraded",
        payload: {
          monitor: monitorPayload,
          region: body.region,
          latencyMs: body.latencyMs,
          degradedAfterMs: monitor.degradedAfterMs,
          checkedAt: checkedAt.toISOString(),
        },
      });
    } else if (
      (previousStatus === "down" || previousStatus === "degraded") &&
      body.status === "up"
    ) {
      const downForMs = monitor.lastCheckedAt
        ? checkedAt.getTime() - monitor.lastCheckedAt.getTime()
        : null;
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.recovered",
        payload: {
          monitor: monitorPayload,
          region: body.region,
          downForMs,
          fromStatus: previousStatus,
          checkedAt: checkedAt.toISOString(),
        },
      });
    }

    // Auto-create a public incident when the consecutive-failures counter
    // crosses the threshold. We also link the monitor, emit
    // `incident.created`, AND insert a first `incident_updates` row so
    // the public timeline shows a clean "investigating" entry instead of
    // a bare row with no narrative.
    if (shouldOpenAutoIncident) {
      const autoCreateMessage =
        `Auto-detected outage. ${monitor.name} has failed ` +
        `${newConsecutiveFailures} consecutive probe${newConsecutiveFailures === 1 ? "" : "s"}` +
        " Investigating.";
      const [created] = await tx
        .insert(schema.incidents)
        .values({
          workspaceId: monitor.workspaceId,
          title: `${monitor.name} is down`,
          status: "investigating",
          severity: "major",
          startedAt: checkedAt,
          autoCreated: true,
        })
        .returning({ id: schema.incidents.id });
      if (created) {
        await tx.insert(schema.incidentMonitors).values({
          incidentId: created.id,
          monitorId: monitor.id,
        });
        await tx.insert(schema.incidentUpdates).values({
          incidentId: created.id,
          status: "investigating",
          message: autoCreateMessage,
          // createdBy is nullable; system-generated updates leave it null.
          createdBy: null,
          createdAt: checkedAt,
        });
        await tx.insert(schema.events).values({
          workspaceId: monitor.workspaceId,
          type: "incident.created",
          payload: {
            incident: {
              id: created.id,
              title: `${monitor.name} is down`,
              status: "investigating",
              severity: "major",
            },
            monitorNames: [monitor.name],
            autoCreated: true,
            message: autoCreateMessage,
          },
        });
      }
    }

    // Auto-resolve any open auto-created incidents linked to this monitor
    // when it recovers. We restrict to `auto_created = true` so a
    // manually-created incident is never closed by a probe — humans own
    // those. We resolve in one UPDATE filtering on status != 'resolved'
    // and use RETURNING to pull the incidents that actually got closed
    // (so we only emit `incident.resolved` events for those).
    if (shouldResolveAutoIncident) {
      const openIds = (
        await tx
          .select({ id: schema.incidents.id })
          .from(schema.incidents)
          .innerJoin(
            schema.incidentMonitors,
            eq(schema.incidentMonitors.incidentId, schema.incidents.id),
          )
          .where(
            and(
              eq(schema.incidents.workspaceId, monitor.workspaceId),
              eq(schema.incidentMonitors.monitorId, monitor.id),
              eq(schema.incidents.autoCreated, true),
              ne(schema.incidents.status, "resolved"),
            ),
          )
      ).map((r) => r.id);

      for (const incidentId of openIds) {
        const [updated] = await tx
          .update(schema.incidents)
          .set({
            status: "resolved",
            resolvedAt: checkedAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.incidents.id, incidentId))
          .returning({
            id: schema.incidents.id,
            title: schema.incidents.title,
            severity: schema.incidents.severity,
            startedAt: schema.incidents.startedAt,
          });
        if (updated) {
          // Add a closing entry to the incident timeline so the public
          // feed has a narrative ending, not just a status flip. Includes
          // a rough duration so readers know how long it lasted.
          const durationMs = checkedAt.getTime() - updated.startedAt.getTime();
          const durationLabel = formatDuration(durationMs);
          const autoResolveMessage = `Auto-resolved. ${monitor.name} returned a successful probe after ${durationLabel}.`;
          await tx.insert(schema.incidentUpdates).values({
            incidentId: updated.id,
            status: "resolved",
            message: autoResolveMessage,
            createdBy: null,
            createdAt: checkedAt,
          });
          await tx.insert(schema.events).values({
            workspaceId: monitor.workspaceId,
            type: "incident.resolved",
            payload: {
              incident: {
                id: updated.id,
                title: updated.title,
                status: "resolved",
                severity: updated.severity,
              },
              monitorNames: [monitor.name],
              autoResolved: true,
              message: autoResolveMessage,
            },
          });
        }
      }
    }
  });

  return c.json({ ok: true });
});

probeRoutes.get("/v1/probes/monitors", async (c) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== env.PROBE_API_KEY) return c.json({ error: "unauthorized" }, 401);

  const conn = db();
  const rows = await conn
    .select({
      id: schema.monitors.id,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
      kind: schema.monitors.kind,
      url: schema.monitors.url,
      method: schema.monitors.method,
      host: schema.monitors.host,
      port: schema.monitors.port,
      headers: schema.monitors.headers,
      body: schema.monitors.body,
      assertions: schema.monitors.assertions,
      degradedAfterMs: schema.monitors.degradedAfterMs,
      followRedirects: schema.monitors.followRedirects,
      intervalSeconds: schema.monitors.intervalSeconds,
      timeoutMs: schema.monitors.timeoutMs,
      retryCount: schema.monitors.retryCount,
      retryDelaySeconds: schema.monitors.retryDelaySeconds,
    })
    .from(schema.monitors)
    .where(eq(schema.monitors.enabled, true));

  return c.json({ monitors: rows });
});
