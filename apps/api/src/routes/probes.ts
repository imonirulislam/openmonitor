import { zValidator } from "@hono/zod-validator";
import { insertRuns } from "@openmonitor/clickhouse";
import {
  and,
  db,
  eq,
  inArray,
  ne,
  nextIncidentNumber,
  reduceRegionStatuses,
  schema,
  sql,
} from "@openmonitor/db";
import { Hono } from "hono";
import { z } from "zod";
import { probeAuth } from "../middleware/probe-auth";

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

probeRoutes.use("/v1/probes/*", probeAuth());

probeRoutes.post("/v1/probes/results", zValidator("json", probeSchema), async (c) => {
  const body = c.req.valid("json");
  const conn = db();

  const [monitor] = await conn
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, body.monitorId))
    .limit(1);

  if (!monitor) return c.json({ error: "monitor not found" }, 404);

  const identity = c.get("probeIdentity");

  // A location may only report on monitors explicitly assigned to it. A private
  // location is additionally confined to its own workspace; a shared one has no
  // workspace, so the assignment join is the whole check. Returns 404 rather
  // than 403 so a token can't be used to enumerate which monitors exist.
  {
    if (identity.workspaceId !== null && identity.workspaceId !== monitor.workspaceId) {
      return c.json({ error: "monitor not found" }, 404);
    }
    const [assigned] = await conn
      .select({ monitorId: schema.probeLocationMonitors.monitorId })
      .from(schema.probeLocationMonitors)
      .where(
        and(
          eq(schema.probeLocationMonitors.probeLocationId, identity.locationId),
          eq(schema.probeLocationMonitors.monitorId, monitor.id),
        ),
      )
      .limit(1);
    if (!assigned) return c.json({ error: "monitor not found" }, 404);
  }

  // The token names the region; the caller never gets to assert it.
  const region = identity.region;

  const checkedAt = body.checkedAt ? new Date(body.checkedAt) : new Date();
  const previousStatus = monitor.currentStatus;
  const threshold = monitor.autoIncidentThreshold ?? 0;

  await conn.transaction(async (tx) => {
    // Record what THIS region saw. Its failure counter is per-region, so a
    // sustained outage in one location isn't masked by healthy probes elsewhere
    // interleaving and resetting a shared counter.
    await tx
      .insert(schema.monitorRegionStatus)
      .values({
        monitorId: body.monitorId,
        region,
        status: body.status,
        consecutiveFailures: body.status === "down" ? 1 : 0,
        lastCheckedAt: checkedAt,
      })
      .onConflictDoUpdate({
        target: [schema.monitorRegionStatus.monitorId, schema.monitorRegionStatus.region],
        set: {
          status: body.status,
          consecutiveFailures:
            body.status === "down"
              ? sql`${schema.monitorRegionStatus.consecutiveFailures} + 1`
              : sql`0`,
          lastCheckedAt: checkedAt,
          updatedAt: new Date(),
        },
      });

    // Derive the monitor's global status from every reporting region rather
    // than from this single probe. With one region this equals `body.status`
    // under all policies, so single-region behavior is unchanged.
    const regionRows = await tx
      .select({
        region: schema.monitorRegionStatus.region,
        status: schema.monitorRegionStatus.status,
      })
      .from(schema.monitorRegionStatus)
      .where(eq(schema.monitorRegionStatus.monitorId, body.monitorId));

    const derivedStatus = reduceRegionStatuses(regionRows, monitor.regionPolicy);
    // Global counter tracks sustained *derived* down-ness, which is what the
    // auto-incident threshold is meant to measure.
    const newConsecutiveFailures = derivedStatus === "down" ? monitor.consecutiveFailures + 1 : 0;

    // Only auto-create a public incident if (a) threshold is enabled, (b) the
    // monitor is globally down, (c) the counter has reached the threshold, and
    // (d) there isn't already an open auto-incident for this monitor. Condition
    // (d) is what enforces "exactly one incident per outage" without requiring
    // an exact-crossing comparison — that way enabling the threshold mid-outage
    // (counter already past threshold) correctly fires on the next failed probe.
    const couldOpenAutoIncident =
      threshold > 0 && derivedStatus === "down" && newConsecutiveFailures >= threshold;
    let shouldOpenAutoIncident = false;
    if (couldOpenAutoIncident) {
      const open = await tx
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
      derivedStatus === "up" && (previousStatus === "down" || previousStatus === "degraded");

    await tx
      .update(schema.monitors)
      .set({
        currentStatus: derivedStatus,
        lastCheckedAt: checkedAt,
        consecutiveFailures: newConsecutiveFailures,
        updatedAt: new Date(),
      })
      .where(eq(schema.monitors.id, body.monitorId));

    // Liveness for the location itself. Without it a checker that has died and a
    // service nobody is probing look identical — both just stop producing rows.
    await tx
      .update(schema.probeLocations)
      .set({ lastSeenAt: checkedAt, updatedAt: new Date() })
      .where(eq(schema.probeLocations.id, identity.locationId));

    // Status-transition events, gated on the DERIVED status:
    //   prev != down                  && next == down     → monitor.down
    //   prev != degraded && prev != down && next == degraded → monitor.degraded
    //   prev ∈ {down, degraded}       && next == up       → monitor.recovered
    //
    // Comparing against the derived value rather than this probe's result is
    // what stops alert storms once several regions report: otherwise one region
    // going down and another reporting up would emit down/recovered on every
    // probe cycle. `region` stays in the payload so the Slack message can still
    // say where it was observed.
    const monitorPayload = {
      id: monitor.id,
      slug: monitor.slug,
      name: monitor.name,
      url: monitor.url,
    };
    if (previousStatus !== "down" && derivedStatus === "down") {
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.down",
        payload: {
          monitor: monitorPayload,
          region,
          error: body.error,
          statusCode: body.statusCode,
          checkedAt: checkedAt.toISOString(),
        },
      });
    } else if (
      previousStatus !== "degraded" &&
      previousStatus !== "down" &&
      derivedStatus === "degraded"
    ) {
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.degraded",
        payload: {
          monitor: monitorPayload,
          region,
          latencyMs: body.latencyMs,
          degradedAfterMs: monitor.degradedAfterMs,
          checkedAt: checkedAt.toISOString(),
        },
      });
    } else if (
      (previousStatus === "down" || previousStatus === "degraded") &&
      derivedStatus === "up"
    ) {
      const downForMs = monitor.lastCheckedAt
        ? checkedAt.getTime() - monitor.lastCheckedAt.getTime()
        : null;
      await tx.insert(schema.events).values({
        workspaceId: monitor.workspaceId,
        type: "monitor.recovered",
        payload: {
          monitor: monitorPayload,
          region,
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
          number: await nextIncidentNumber(tx, monitor.workspaceId),
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

  // The raw result goes to ClickHouse, outside the transaction above.
  //
  // It can't be inside it — they're different stores — and it doesn't need to
  // be. Everything the outbox rule protects lives in Postgres: the per-region
  // status, the derived status, the counters and the events row all commit
  // together. This table is telemetry that only ever gets read in aggregate,
  // so a failure here costs a point on a chart, not an alert.
  //
  // Which is also why it doesn't fail the request. The probe *was* processed;
  // a 500 would make the checker re-post and double-count the failure counter
  // that drives auto-incidents.
  try {
    await insertRuns([
      {
        monitorId: body.monitorId,
        workspaceId: monitor.workspaceId,
        region,
        status: body.status,
        statusCode: body.statusCode,
        latencyMs: body.latencyMs,
        latencyDnsMs: body.latencyDnsMs,
        latencyConnectMs: body.latencyConnectMs,
        latencyTlsMs: body.latencyTlsMs,
        latencyTtfbMs: body.latencyTtfbMs,
        latencyTransferMs: body.latencyTransferMs,
        error: body.error,
        checkedAt,
      },
    ]);
  } catch (err) {
    console.error("clickhouse insert failed (probe still recorded):", err);
  }

  return c.json({ ok: true });
});

probeRoutes.get("/v1/probes/monitors", async (c) => {
  // Auth already ran in probeAuth for /v1/probes/*; re-checking the raw header
  // here would reject location tokens.
  const identity = c.get("probeIdentity");
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
    // A location only ever learns about monitors it was assigned.
    .where(
      and(
        eq(schema.monitors.enabled, true),
        inArray(
          schema.monitors.id,
          conn
            .select({ id: schema.probeLocationMonitors.monitorId })
            .from(schema.probeLocationMonitors)
            .where(eq(schema.probeLocationMonitors.probeLocationId, identity.locationId)),
        ),
      ),
    );

  return c.json({ monitors: rows });
});
