import { type Context, Hono } from "hono";
// rrule's main entry is a UMD bundle; named ESM imports fail at runtime.
// Default-import then destructure to get the actual exports.
import rrulePkg from "rrule";

const { rrulestr } = rrulePkg as unknown as typeof import("rrule");

import { and, asc, db, desc, eq, gte, inArray, schema, sql } from "@openmonitor/db";
import { resolveStatusPage } from "../lib/resolve-page";
import { verifyUnlockToken } from "../lib/unlock-token";

export const statusRoutes = new Hono();

/**
 * Pulls an unlock token from either the `Authorization: Bearer <t>` header or
 * the `?unlock=<t>` query param. The status-page server sets it as a query
 * param (simpler than threading custom headers through the api-client).
 */
function readUnlockToken(c: Context): string | undefined {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return c.req.query("unlock");
}

statusRoutes.get("/v1/status", async (c) => {
  const conn = db();
  const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Resolve which status page this request targets. Three ways to specify:
  //   1. ?workspace=<slug>&page=<slug> — explicit pair
  //   2. ?statusPage=<slug>            — page slug across workspaces (back-compat)
  //   3. (nothing)                     — default workspace's default page
  const workspaceSlug = c.req.query("workspace");
  const pageSlug = c.req.query("page") ?? c.req.query("statusPage") ?? "default";
  // The status-page app forwards the original request Host as ?host= so a
  // custom_domain can win over the (workspace, page) slugs.
  const host = c.req.query("host");

  const pageRow = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!pageRow || !pageRow.isPublic) {
    return c.json({ error: "status page not found" }, 404);
  }
  if (pageRow.passwordHash) {
    const token = readUnlockToken(c);
    if (!token || !verifyUnlockToken(token, pageRow.id)) {
      // 401 with a discriminator the front-end can use to render the unlock UX.
      return c.json({ error: "unlock required", requiresPassword: true }, 401);
    }
  }
  const page = pageRow;
  const ws = page.workspaceId;

  // Components visible on this status page. LEFT JOIN so type='static' rows
  // (monitor_id IS NULL) flow through. Name + description come from the
  // page_components row (admin overrides), not the underlying monitor. Status
  // is monitor.currentStatus for monitor-typed components, or the admin-set
  // staticStatus for static ones.
  const componentRows = await conn
    .select({
      id: schema.pageComponents.id,
      type: schema.pageComponents.type,
      monitorSlug: schema.monitors.slug,
      monitorEnabled: schema.monitors.enabled,
      name: schema.pageComponents.name,
      description: schema.pageComponents.description,
      monitorStatus: schema.monitors.currentStatus,
      staticStatus: schema.pageComponents.staticStatus,
      lastCheckedAt: schema.monitors.lastCheckedAt,
      groupId: schema.pageComponents.groupId,
      position: schema.pageComponents.position,
      groupPosition: schema.pageComponents.groupPosition,
    })
    .from(schema.pageComponents)
    .leftJoin(schema.monitors, eq(schema.monitors.id, schema.pageComponents.monitorId))
    .where(
      and(
        eq(schema.pageComponents.statusPageId, page.id),
        eq(schema.pageComponents.workspaceId, ws),
      ),
    )
    .orderBy(asc(schema.pageComponents.position), asc(schema.pageComponents.groupPosition));

  // Hide monitor-typed components whose underlying monitor has been disabled.
  // Static components always surface.
  const visibleComponents = componentRows.filter(
    (c) => c.type === "static" || c.monitorEnabled === true,
  );

  const componentGroupRows = await conn
    .select({
      id: schema.pageComponentGroups.id,
      name: schema.pageComponentGroups.name,
      defaultOpen: schema.pageComponentGroups.defaultOpen,
    })
    .from(schema.pageComponentGroups)
    .where(eq(schema.pageComponentGroups.statusPageId, page.id))
    .orderBy(asc(schema.pageComponentGroups.position));

  // Page-scope filter: only surface incidents/maintenances linked to monitors
  // that actually live on this status page. Otherwise a workspace incident
  // affecting monitor X would leak onto every page in the workspace, even
  // pages that don't include X.
  const pageMonitorIds = visibleComponents
    .map((c) => c.monitorSlug) // we already have slug; need ids — fetch below
    // (we don't have ids on componentRows, so look them up via a join)
    .filter((s): s is string => !!s);
  const pageMonitorIdRows =
    pageMonitorIds.length > 0
      ? await conn
          .select({ id: schema.monitors.id })
          .from(schema.monitors)
          .where(
            and(eq(schema.monitors.workspaceId, ws), inArray(schema.monitors.slug, pageMonitorIds)),
          )
      : [];
  const pageMonitorIdSet = new Set(pageMonitorIdRows.map((r) => r.id));

  // Subquery returning incident IDs that touch at least one monitor on this
  // page. Used as the page-scope filter on both active and past incidents.
  const pageIncidentIdsSubquery = conn
    .select({ id: schema.incidentMonitors.incidentId })
    .from(schema.incidentMonitors)
    .where(
      pageMonitorIdSet.size > 0
        ? inArray(schema.incidentMonitors.monitorId, [...pageMonitorIdSet])
        : sql`false`,
    );

  // Active (non-resolved) incidents — workspace + page-scoped.
  const activeIncidents = await conn
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.workspaceId, ws),
        sql`${schema.incidents.status} <> 'resolved'`,
        inArray(schema.incidents.id, pageIncidentIdsSubquery),
      ),
    )
    .orderBy(desc(schema.incidents.startedAt));

  // Past resolved incidents — last 30 days, for the events feed. Same scope.
  const pastIncidents = await conn
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.workspaceId, ws),
        eq(schema.incidents.status, "resolved"),
        gte(schema.incidents.startedAt, recentSince),
        inArray(schema.incidents.id, pageIncidentIdsSubquery),
      ),
    )
    .orderBy(desc(schema.incidents.startedAt));

  const allIncidents = [...activeIncidents, ...pastIncidents];
  const incidentIds = allIncidents.map((i) => i.id);

  // All updates for the involved incidents.
  const allUpdates =
    incidentIds.length > 0
      ? await conn
          .select()
          .from(schema.incidentUpdates)
          .where(inArray(schema.incidentUpdates.incidentId, incidentIds))
          .orderBy(asc(schema.incidentUpdates.createdAt))
      : [];

  const updatesByIncident = new Map<
    string,
    Array<{ status: string; message: string; createdAt: string }>
  >();
  for (const u of allUpdates) {
    const list = updatesByIncident.get(u.incidentId) ?? [];
    list.push({
      status: u.status,
      message: u.message,
      createdAt: u.createdAt.toISOString(),
    });
    updatesByIncident.set(u.incidentId, list);
  }

  const incidentMonitorRows = await conn
    .select({
      incidentId: schema.incidentMonitors.incidentId,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
    })
    .from(schema.incidentMonitors)
    .innerJoin(schema.monitors, eq(schema.monitors.id, schema.incidentMonitors.monitorId));

  const monitorsByIncident = new Map<string, Array<{ slug: string; name: string }>>();
  for (const r of incidentMonitorRows) {
    const list = monitorsByIncident.get(r.incidentId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    monitorsByIncident.set(r.incidentId, list);
  }

  const buildIncident = (i: (typeof activeIncidents)[number]) => {
    const updates = updatesByIncident.get(i.id) ?? [];
    return {
      id: i.id,
      title: i.title,
      status: i.status,
      severity: i.severity,
      startedAt: i.startedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      affected: monitorsByIncident.get(i.id) ?? [],
      updates,
      latestUpdate: updates[updates.length - 1]?.message ?? null,
    };
  };

  // Page-scope subquery for maintenance — same logic as incidents.
  const pageMaintenanceIdsSubquery = conn
    .select({ id: schema.maintenanceMonitors.maintenanceId })
    .from(schema.maintenanceMonitors)
    .where(
      pageMonitorIdSet.size > 0
        ? inArray(schema.maintenanceMonitors.monitorId, [...pageMonitorIdSet])
        : sql`false`,
    );

  // Active + scheduled/in-progress maintenance for banner; past completed for feed.
  // Recurrence: rows with a recurrenceRule are kept regardless of endsAt because
  // future occurrences may still be valid; we expand them below.
  const upcomingMaintenance = await conn
    .select()
    .from(schema.maintenances)
    .where(
      and(
        eq(schema.maintenances.workspaceId, ws),
        sql`${schema.maintenances.status} <> 'completed'`,
        sql`${schema.maintenances.status} <> 'cancelled'`,
        sql`(${schema.maintenances.endsAt} >= now() OR ${schema.maintenances.recurrenceRule} IS NOT NULL)`,
        inArray(schema.maintenances.id, pageMaintenanceIdsSubquery),
      ),
    )
    .orderBy(asc(schema.maintenances.startsAt));

  const pastMaintenance = await conn
    .select()
    .from(schema.maintenances)
    .where(
      and(
        eq(schema.maintenances.workspaceId, ws),
        eq(schema.maintenances.status, "completed"),
        gte(schema.maintenances.endsAt, recentSince),
        inArray(schema.maintenances.id, pageMaintenanceIdsSubquery),
      ),
    )
    .orderBy(desc(schema.maintenances.endsAt));

  const maintenanceMonitorRows = await conn
    .select({
      maintenanceId: schema.maintenanceMonitors.maintenanceId,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
    })
    .from(schema.maintenanceMonitors)
    .innerJoin(schema.monitors, eq(schema.monitors.id, schema.maintenanceMonitors.monitorId));

  const monitorsByMaintenance = new Map<string, Array<{ slug: string; name: string }>>();
  for (const r of maintenanceMonitorRows) {
    const list = monitorsByMaintenance.get(r.maintenanceId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    monitorsByMaintenance.set(r.maintenanceId, list);
  }

  // Expand recurring maintenance into projected occurrences. We surface the
  // original row plus up to MAX_PROJECTED future starts within a 90-day
  // horizon (or recurrenceUntil if sooner). Each projected instance keeps the
  // base id with a `#<iso>` suffix so the client can dedupe.
  const HORIZON_MS = 90 * 24 * 60 * 60 * 1000;
  const MAX_PROJECTED = 12;

  type ExpandedMaintenance = (typeof upcomingMaintenance)[number] & { occurrenceId: string };
  const expanded: ExpandedMaintenance[] = [];
  const now = Date.now();
  const horizonDate = new Date(now + HORIZON_MS);

  for (const m of upcomingMaintenance) {
    if (m.endsAt.getTime() >= now) {
      expanded.push({ ...m, occurrenceId: m.id });
    }
    if (!m.recurrenceRule) continue;
    try {
      const rule = rrulestr(m.recurrenceRule, { dtstart: m.startsAt });
      const cap = m.recurrenceUntil
        ? new Date(Math.min(horizonDate.getTime(), m.recurrenceUntil.getTime()))
        : horizonDate;
      const occurrences = rule.between(new Date(now), cap, true).slice(0, MAX_PROJECTED);
      const durationMs = m.endsAt.getTime() - m.startsAt.getTime();
      for (const start of occurrences) {
        if (start.getTime() <= m.startsAt.getTime()) continue;
        expanded.push({
          ...m,
          startsAt: start,
          endsAt: new Date(start.getTime() + durationMs),
          occurrenceId: `${m.id}#${start.toISOString()}`,
        });
      }
    } catch {
      // Bad RRULE — log nothing here, just skip projection. The base row
      // still surfaces if it's currently active.
    }
  }
  expanded.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const buildMaintenance = (m: ExpandedMaintenance) => ({
    id: m.occurrenceId,
    title: m.title,
    description: m.description,
    status: m.status,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    affected: monitorsByMaintenance.get(m.id) ?? [],
  });

  return c.json({
    page: {
      name: page.name,
      logoUrl: page.logoUrl,
      iconUrl: page.iconUrl,
      primaryColor: page.primaryColor,
      customCss: page.customCss,
      homepageUrl: page.homepageUrl,
      contactUrl: page.contactUrl,
    },
    components: visibleComponents.map((c) => ({
      id: c.id,
      type: c.type,
      monitorSlug: c.monitorSlug,
      name: c.name,
      description: c.description,
      status: c.type === "monitor" ? (c.monitorStatus ?? "unknown") : (c.staticStatus ?? "unknown"),
      lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
      groupId: c.groupId,
    })),
    componentGroups: componentGroupRows.map((g) => ({
      id: g.id,
      name: g.name,
      defaultOpen: g.defaultOpen,
    })),
    incidents: activeIncidents.map(buildIncident),
    maintenances: expanded.map(buildMaintenance),
    pastIncidents: pastIncidents.map(buildIncident),
    pastMaintenances: pastMaintenance.map((m) => buildMaintenance({ ...m, occurrenceId: m.id })),
  });
});

statusRoutes.get("/v1/monitors/:slug/history", async (c) => {
  const slug = c.req.param("slug");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 90), 1), 180);
  const tz = isValidIanaTz(c.req.query("tz")) ? (c.req.query("tz") as string) : "UTC";
  const workspaceSlug = c.req.query("workspace");
  const pageSlug = c.req.query("page") ?? c.req.query("statusPage") ?? "default";
  const host = c.req.query("host");
  const conn = db();

  // Resolve target status page and only return history for monitors that are
  // both in the page's workspace AND linked to the page (otherwise a probed-
  // but-not-public monitor's history would leak through this endpoint).
  const page = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!page || !page.isPublic) return c.json({ error: "status page not found" }, 404);
  if (page.passwordHash) {
    const token = readUnlockToken(c);
    if (!token || !verifyUnlockToken(token, page.id)) {
      return c.json({ error: "unlock required", requiresPassword: true }, 401);
    }
  }

  const [monitor] = await conn
    .select({
      id: schema.monitors.id,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
    })
    .from(schema.monitors)
    .innerJoin(schema.pageComponents, eq(schema.pageComponents.monitorId, schema.monitors.id))
    .where(
      and(
        eq(schema.monitors.slug, slug),
        eq(schema.monitors.workspaceId, page.workspaceId),
        eq(schema.pageComponents.statusPageId, page.id),
      ),
    )
    .limit(1);

  if (!monitor) return c.json({ error: "monitor not found" }, 404);

  // Generate the day list and bucket the probe stats in the requested TZ. Doing
  // this in SQL avoids JS Date manipulation in arbitrary timezones (which Node
  // does poorly without an extra library).
  //
  // We surface per-status counts so the public-page tracker can render each
  // day as a proportional stacked bar (matches openstatus). `failed` is kept
  // for back-compat with older clients; it equals `down + degraded`.
  const result = await conn.execute(sql`
    WITH all_days AS (
      SELECT (
        ((now() AT TIME ZONE ${tz})::date) - (g)::int
      ) AS day_local
      FROM generate_series(0, ${days - 1}) AS g
    ),
    bucketed AS (
      SELECT
        date_trunc('day', checked_at AT TIME ZONE ${tz})::date AS day_local,
        count(*)::int AS total,
        sum(case when status = 'up'       then 1 else 0 end)::int AS ok,
        sum(case when status = 'degraded' then 1 else 0 end)::int AS degraded,
        sum(case when status = 'down'     then 1 else 0 end)::int AS down,
        sum(case when status = 'unknown'  then 1 else 0 end)::int AS unknown
      FROM monitor_runs
      WHERE monitor_id = ${monitor.id}
        AND checked_at AT TIME ZONE ${tz} >= ((now() AT TIME ZONE ${tz})::date - ${days - 1} * INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      to_char(a.day_local, 'YYYY-MM-DD') AS date,
      coalesce(b.total, 0)::int    AS total,
      coalesce(b.ok, 0)::int       AS ok,
      coalesce(b.degraded, 0)::int AS degraded,
      coalesce(b.down, 0)::int     AS down,
      coalesce(b.unknown, 0)::int  AS unknown
    FROM all_days a
    LEFT JOIN bucketed b USING (day_local)
    ORDER BY a.day_local ASC
  `);

  type Row = {
    date: string;
    total: number;
    ok: number;
    degraded: number;
    down: number;
    unknown: number;
  };

  // Pull incidents + maintenances overlapping the window, linked to this
  // monitor. We compute per-day membership in JS — there are at most ~180
  // days and typically <50 events, so the cross-product is cheap and the
  // SQL stays simple. Recurring maintenances are kept as their base
  // window (RRULE expansion happens elsewhere); single occurrences cover
  // the common case.
  const windowStartIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const incidentRows = await conn
    .select({
      id: schema.incidents.id,
      title: schema.incidents.title,
      status: schema.incidents.status,
      severity: schema.incidents.severity,
      startedAt: schema.incidents.startedAt,
      resolvedAt: schema.incidents.resolvedAt,
      autoCreated: schema.incidents.autoCreated,
    })
    .from(schema.incidents)
    .innerJoin(schema.incidentMonitors, eq(schema.incidentMonitors.incidentId, schema.incidents.id))
    .where(
      and(
        eq(schema.incidents.workspaceId, page.workspaceId),
        eq(schema.incidentMonitors.monitorId, monitor.id),
        // Parenthesise the OR — without these, AND binds tighter and the
        // workspace/monitor filters end up only applying to the IS NULL
        // branch, leaking incidents from other monitors that happen to be
        // within the window.
        sql`(${schema.incidents.resolvedAt} IS NULL OR ${schema.incidents.resolvedAt} >= ${windowStartIso})`,
      ),
    );
  const maintenanceRows = await conn
    .select({
      id: schema.maintenances.id,
      title: schema.maintenances.title,
      status: schema.maintenances.status,
      startsAt: schema.maintenances.startsAt,
      endsAt: schema.maintenances.endsAt,
    })
    .from(schema.maintenances)
    .innerJoin(
      schema.maintenanceMonitors,
      eq(schema.maintenanceMonitors.maintenanceId, schema.maintenances.id),
    )
    .where(
      and(
        eq(schema.maintenances.workspaceId, page.workspaceId),
        eq(schema.maintenanceMonitors.monitorId, monitor.id),
        sql`${schema.maintenances.endsAt} >= ${windowStartIso}`,
      ),
    );

  type DayEvent = {
    type: "incident" | "maintenance";
    id: string;
    title: string;
    status: string;
    severity?: "minor" | "major" | "critical";
    autoCreated?: boolean;
    /** ISO timestamp marking the event's start. */
    from: string;
    /** ISO timestamp marking the event's end. Null for ongoing events. */
    to: string | null;
  };
  const incidents: DayEvent[] = incidentRows.map((r) => ({
    type: "incident",
    id: r.id,
    title: r.title,
    status: r.status,
    severity: r.severity,
    autoCreated: r.autoCreated,
    from: r.startedAt.toISOString(),
    to: r.resolvedAt?.toISOString() ?? null,
  }));
  const maintenances: DayEvent[] = maintenanceRows.map((r) => ({
    type: "maintenance",
    id: r.id,
    title: r.title,
    status: r.status,
    from: r.startsAt.toISOString(),
    to: r.endsAt.toISOString(),
  }));
  const allEvents = [...incidents, ...maintenances];

  /**
   * An event overlaps a day if its `from` is on or before the day's UTC
   * end and its `to` (or now, for ongoing) is on or after the day's UTC
   * start. We use UTC day boundaries here for simplicity — the day cell's
   * `date` string is already in `tz`, and a 24h span is a stable enough
   * proxy for the small visual difference between TZs the UI shows.
   */
  function eventsForDay(date: string): DayEvent[] {
    const start = new Date(`${date}T00:00:00Z`).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const now = Date.now();
    return allEvents.filter((e) => {
      const f = new Date(e.from).getTime();
      const t = e.to ? new Date(e.to).getTime() : now;
      return f < end && t >= start;
    });
  }

  const out = (result as unknown as Row[]).map((r) => {
    const failed = r.degraded + r.down;
    const events = eventsForDay(r.date);
    if (r.total === 0) {
      return { ...r, failed, events, status: "no_data" as const };
    }
    // Day-level rollup uses a hybrid rule: a day is `down` only when there
    // are at least 2 failures AND less than 95% success. Otherwise:
    //   - 0 failures → up
    //   - 1 failure (any ratio) → degraded
    //   - 2+ failures with ratio ≥ 95% → degraded
    // This avoids labelling a partial day as "Outage" off a single failure
    // (e.g. 1/4 failed → 75% — that's the early-morning case the public
    // tracker used to flip red after one bad probe). `unknown` rows count
    // toward total but neither ok nor failed, so a day full of unknowns
    // still drags the ratio low.
    const ratio = r.ok / r.total;
    const status =
      failed === 0
        ? ("up" as const)
        : failed >= 2 && ratio < 0.95
          ? ("down" as const)
          : ("degraded" as const);
    return { ...r, failed, events, status };
  });

  return c.json({
    monitor: { id: monitor.id, slug: monitor.slug, name: monitor.name },
    days: out,
    tz,
  });
});

statusRoutes.get("/v1/monitors/:slug/latency", async (c) => {
  const slug = c.req.param("slug");
  // Default 24h window, configurable up to 7 days. ~10-minute buckets are
  // hard-coded — they match the admin chart and keep the response payload
  // small enough to render server-side without pagination.
  const hours = Math.min(Math.max(Number(c.req.query("hours") ?? 24), 1), 168);
  const workspaceSlug = c.req.query("workspace");
  const pageSlug = c.req.query("page") ?? c.req.query("statusPage") ?? "default";
  const host = c.req.query("host");
  const conn = db();

  const page = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!page || !page.isPublic) return c.json({ error: "status page not found" }, 404);
  if (page.passwordHash) {
    const token = readUnlockToken(c);
    if (!token || !verifyUnlockToken(token, page.id)) {
      return c.json({ error: "unlock required", requiresPassword: true }, 401);
    }
  }

  const [monitor] = await conn
    .select({
      id: schema.monitors.id,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
    })
    .from(schema.monitors)
    .innerJoin(schema.pageComponents, eq(schema.pageComponents.monitorId, schema.monitors.id))
    .where(
      and(
        eq(schema.monitors.slug, slug),
        eq(schema.monitors.workspaceId, page.workspaceId),
        eq(schema.pageComponents.statusPageId, page.id),
      ),
    )
    .limit(1);

  if (!monitor) return c.json({ error: "monitor not found" }, 404);

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const result = await conn
    .select({
      bucket: sql<string>`to_char(date_trunc('hour', checked_at) + (extract(minute from checked_at)::int / 10) * interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:00Z')`,
      avg: sql<number>`coalesce(round(avg(latency_ms))::int, 0)`,
      p95: sql<number>`coalesce((percentile_cont(0.95) within group (order by latency_ms))::int, 0)`,
      ok: sql<number>`sum(case when status = 'up' then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(schema.monitorRuns)
    .where(
      and(eq(schema.monitorRuns.monitorId, monitor.id), gte(schema.monitorRuns.checkedAt, since)),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return c.json({
    monitor: { id: monitor.id, slug: monitor.slug, name: monitor.name },
    hours,
    buckets: result,
  });
});

function isValidIanaTz(tz: string | undefined): boolean {
  if (!tz) return false;
  // Cheap allow-list pattern: "Region/City" or simple names like "UTC" / "GMT".
  // Full validation happens in Postgres when the query runs — invalid names
  // throw and the request 500s, which is fine.
  return /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz);
}
