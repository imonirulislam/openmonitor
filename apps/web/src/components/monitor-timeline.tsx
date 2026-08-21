import { rows as chRows, db, eq, schema, sql } from "@openmonitor/db";
import { Card, SectionTitle } from "@openmonitor/ui";
import { MonitorTimelineTable, type TimelineRow } from "./monitor-timeline-table";

/**
 * "Timeline" section under each monitor. Mirrors openstatus's per-monitor
 * timeline: each row is a probe-derived state transition (Monitor Failed /
 * Recovered / Degraded) or an incident lifecycle entry (Created /
 * Resolved). Source is the `events` outbox the probes route writes —
 * scoped to this monitor either via `payload->'monitor'->>'id'` (monitor
 * events) or via the `incident_monitors` link (incident events).
 *
 * Replaces the previous audit-log-of-admin-actions view, which surfaced
 * config edits ("monitor.updated.config") rather than what actually
 * happened to the probe.
 */
export async function MonitorTimeline({
  monitorId,
  workspaceId,
}: {
  monitorId: string;
  workspaceId: string;
}) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const conn = db();

  // Monitor events. The payload always carries `monitor.id`, so filter on
  // that. Cast to uuid via Postgres `::uuid` so the comparison uses the
  // type-safe operator class instead of jsonb-to-text.
  const monitorEvents = await conn.execute(sql`
    SELECT id, type, payload, created_at
    FROM events
    WHERE workspace_id = ${workspaceId}
      AND created_at >= ${since.toISOString()}
      AND type IN ('monitor.down', 'monitor.recovered', 'monitor.degraded')
      AND (payload->'monitor'->>'id')::uuid = ${monitorId}
    ORDER BY created_at DESC
    LIMIT 200
  `);

  // Incident events for this monitor. Find incident IDs linked via
  // incident_monitors, then pull events that reference them.
  const linkedIncidentIds = await conn
    .select({ id: schema.incidentMonitors.incidentId })
    .from(schema.incidentMonitors)
    .where(eq(schema.incidentMonitors.monitorId, monitorId));
  let incidentEvents: Array<{
    id: string;
    type: string;
    payload: unknown;
    created_at: string;
  }> = [];
  if (linkedIncidentIds.length > 0) {
    // Build a parameterized IN list rather than concatenating strings —
    // ids are uuids from our own DB, so injection isn't a real risk, but
    // hygiene matters and `sql.join` is the drizzle-native way.
    const idLiterals = sql.join(
      linkedIncidentIds.map((r) => sql`${r.id}::uuid`),
      sql`, `,
    );
    const rows = await conn.execute(sql`
      SELECT id, type, payload, created_at
      FROM events
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${since.toISOString()}
        AND type IN ('incident.created', 'incident.resolved', 'incident.updated')
        AND (payload->'incident'->>'id')::uuid IN (${idLiterals})
      ORDER BY created_at DESC
      LIMIT 200
    `);
    incidentEvents = chRows<(typeof incidentEvents)[number]>(rows);
  }

  type RawEvent = {
    id: string;
    type: string;
    payload: unknown;
    created_at: string | Date;
  };
  const merged: TimelineRow[] = [...chRows<RawEvent>(monitorEvents), ...incidentEvents]
    .map((row) => toTimelineRow(row))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 200);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionTitle>Timeline</SectionTitle>
        <p className="font-mono text-muted-foreground text-sm tracking-tight">
          What happened to your monitor over the last 30 days
        </p>
      </div>

      {merged.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <p className="font-medium">No events</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Nothing has happened to this monitor in the last 30 days.
          </p>
        </Card>
      ) : (
        <MonitorTimelineTable rows={merged} />
      )}
    </section>
  );
}

/**
 * Translate a raw event row into a TimelineRow with action label + chip
 * payload. Each event type has its own mapping; unknown types fall back to
 * a neutral row so the timeline never silently drops data.
 */
function toTimelineRow(row: {
  id: string;
  type: string;
  payload: unknown;
  created_at: string | Date;
}): TimelineRow {
  const ts =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();
  const p = (row.payload ?? {}) as Record<string, unknown>;

  // Helper for the chip-renderer: each chip is { label, value }. The label
  // sits in a muted pill, the value in a foreground pill, side by side.
  const chips: Array<{ label: string; value: string }> = [];

  switch (row.type) {
    case "monitor.down": {
      const region = (p.region as string | undefined) ?? null;
      const status = p.statusCode as number | null | undefined;
      const error = p.error as string | null | undefined;
      if (region) chips.push({ label: "region", value: region });
      if (status != null) chips.push({ label: "status", value: String(status) });
      if (error) chips.push({ label: "error", value: truncate(error, 60) });
      return {
        id: row.id,
        action: "Monitor Failed",
        kind: "fail",
        timestamp: ts,
        chips,
      };
    }
    case "monitor.recovered": {
      const region = (p.region as string | undefined) ?? null;
      const downForMs = p.downForMs as number | null | undefined;
      const fromStatus = (p.fromStatus as string | undefined) ?? null;
      if (region) chips.push({ label: "region", value: region });
      if (downForMs != null) {
        chips.push({ label: "down for", value: formatDuration(downForMs) });
      }
      if (fromStatus) chips.push({ label: "from", value: fromStatus });
      return {
        id: row.id,
        action: "Monitor Recovered",
        kind: "ok",
        timestamp: ts,
        chips,
      };
    }
    case "monitor.degraded": {
      const region = (p.region as string | undefined) ?? null;
      const latency = p.latencyMs as number | null | undefined;
      const threshold = p.degradedAfterMs as number | null | undefined;
      if (region) chips.push({ label: "region", value: region });
      if (latency != null) chips.push({ label: "latency", value: `${latency} ms` });
      if (threshold != null) chips.push({ label: "threshold", value: `${threshold} ms` });
      return {
        id: row.id,
        action: "Monitor Degraded",
        kind: "warn",
        timestamp: ts,
        chips,
      };
    }
    case "incident.created": {
      const incident = (p.incident as { title?: string } | undefined) ?? {};
      const auto = p.autoCreated === true;
      if (incident.title) chips.push({ label: "title", value: truncate(incident.title, 60) });
      if (auto) chips.push({ label: "auto", value: "yes" });
      return {
        id: row.id,
        action: "Incident Created",
        kind: "fail",
        timestamp: ts,
        chips,
      };
    }
    case "incident.resolved": {
      const incident = (p.incident as { title?: string } | undefined) ?? {};
      const auto = p.autoResolved === true;
      if (incident.title) chips.push({ label: "title", value: truncate(incident.title, 60) });
      if (auto) chips.push({ label: "auto", value: "yes" });
      return {
        id: row.id,
        action: "Incident Resolved",
        kind: "ok",
        timestamp: ts,
        chips,
      };
    }
    case "incident.updated": {
      const incident = (p.incident as { title?: string; status?: string } | undefined) ?? {};
      if (incident.title) chips.push({ label: "title", value: truncate(incident.title, 60) });
      if (incident.status) chips.push({ label: "status", value: incident.status });
      return {
        id: row.id,
        action: "Incident Updated",
        kind: "neutral",
        timestamp: ts,
        chips,
      };
    }
    default:
      return {
        id: row.id,
        action: row.type,
        kind: "neutral",
        timestamp: ts,
        chips,
      };
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.round(totalSec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const remain = min % 60;
  return remain === 0 ? `${hours}h` : `${hours}h ${remain}m`;
}
