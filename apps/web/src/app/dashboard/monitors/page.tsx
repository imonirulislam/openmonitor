import { and, db, desc, eq, gte, inArray, schema, sql } from "@openmonitor/db";
import {
  Button,
  MetricCardButton,
  MetricCardGroup,
  MetricCardHeader,
  MetricCardTitle,
  MetricCardValue,
  type MetricCardVariant,
  Section,
  SectionDescription,
  SectionGroup,
  SectionHeader,
  SectionHeaderRow,
  SectionTitle,
} from "@openmonitor/ui";
import { ArrowDownIcon, CheckCircle2Icon, ListFilterIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { MonitorsTable } from "~/components/monitors-table";
import { getCurrentWorkspaceId } from "~/lib/workspace";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

const STATUS_FILTERS: Array<{
  key: MonitorStatus;
  title: string;
  variant: MetricCardVariant;
}> = [
  { key: "up", title: "Operational", variant: "success" },
  { key: "degraded", title: "Degraded", variant: "warning" },
  { key: "down", title: "Outage", variant: "destructive" },
  { key: "unknown", title: "Unknown", variant: "default" },
];

export default async function MonitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const activeStatus = isMonitorStatus(sp.status) ? sp.status : null;
  const sortByP95 = sp.sort === "p95";

  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch all monitors first — need the totals for the unfiltered counts on
  // the metric cards even when a filter is active.
  const monitors = await conn
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, workspaceId))
    .orderBy(desc(schema.monitors.createdAt));

  const counts: Record<MonitorStatus, number> = {
    up: 0,
    down: 0,
    degraded: 0,
    unknown: 0,
  };
  for (const m of monitors) counts[m.currentStatus] += 1;

  const monitorIds = monitors.map((m) => m.id);

  // Per-monitor last-incident date.
  const lastIncidents =
    monitorIds.length > 0
      ? await conn
          .select({
            monitorId: schema.incidentMonitors.monitorId,
            startedAt: sql<Date>`max(${schema.incidents.startedAt})`,
          })
          .from(schema.incidentMonitors)
          .innerJoin(schema.incidents, eq(schema.incidents.id, schema.incidentMonitors.incidentId))
          .where(inArray(schema.incidentMonitors.monitorId, monitorIds))
          .groupBy(schema.incidentMonitors.monitorId)
      : [];
  const lastIncidentByMonitor = new Map<string, Date>();
  for (const r of lastIncidents) {
    if (r.startedAt) lastIncidentByMonitor.set(r.monitorId, new Date(r.startedAt));
  }

  // Per-monitor p95 latency over the last 24h. percentile_cont returns null
  // when the monitor has no successful samples in the window — we surface
  // null in the table cell.
  const p95Rows =
    monitorIds.length > 0
      ? await conn
          .select({
            monitorId: schema.monitorRuns.monitorId,
            p95: sql<
              number | null
            >`(percentile_cont(0.95) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
          })
          .from(schema.monitorRuns)
          .where(
            and(
              inArray(schema.monitorRuns.monitorId, monitorIds),
              gte(schema.monitorRuns.checkedAt, since24h),
            ),
          )
          .groupBy(schema.monitorRuns.monitorId)
      : [];
  const p95ByMonitor = new Map<string, number | null>();
  for (const r of p95Rows) p95ByMonitor.set(r.monitorId, r.p95);

  // Workspace-wide p95 for the metric card display.
  const [globalP95Row] =
    monitorIds.length > 0
      ? await conn
          .select({
            p95: sql<
              number | null
            >`(percentile_cont(0.95) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
          })
          .from(schema.monitorRuns)
          .innerJoin(schema.monitors, eq(schema.monitors.id, schema.monitorRuns.monitorId))
          .where(
            and(
              eq(schema.monitors.workspaceId, workspaceId),
              gte(schema.monitorRuns.checkedAt, since24h),
            ),
          )
      : [];
  const globalP95 = globalP95Row?.p95 ?? null;

  // Apply filter then sort.
  const filtered = activeStatus
    ? monitors.filter((m) => m.currentStatus === activeStatus)
    : monitors;

  const sorted = sortByP95
    ? [...filtered].sort((a, b) => {
        const pa = p95ByMonitor.get(a.id);
        const pb = p95ByMonitor.get(b.id);
        // Nulls (no samples in window) sort to the bottom regardless of
        // direction so they don't pollute the "slowest first" view.
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      })
    : filtered;

  // Build URLs for the metric-card links — keep one param while toggling the
  // other (so clicking `p95` doesn't drop the active status filter).
  const buildHref = (next: { status?: string | null; sort?: string | null }) => {
    const params = new URLSearchParams();
    const nextStatus = next.status === undefined ? activeStatus : next.status;
    const nextSort = next.sort === undefined ? (sortByP95 ? "p95" : null) : next.sort;
    if (nextStatus) params.set("status", nextStatus);
    if (nextSort) params.set("sort", nextSort);
    const qs = params.toString();
    return qs ? `/dashboard/monitors?${qs}` : "/dashboard/monitors";
  };

  return (
    <SectionGroup>
      <Section>
        <SectionHeaderRow>
          <SectionHeader>
            <SectionTitle>Monitors</SectionTitle>
            <SectionDescription>Create and manage your monitors.</SectionDescription>
          </SectionHeader>
          <Button asChild size="sm">
            <Link href="/dashboard/monitors/new">
              <PlusIcon /> Create Monitor
            </Link>
          </Button>
        </SectionHeaderRow>

        <MetricCardGroup>
          {STATUS_FILTERS.map((f) => {
            const isActive = activeStatus === f.key;
            const href = buildHref({ status: isActive ? null : f.key });
            const Icon = isActive ? CheckCircle2Icon : ListFilterIcon;
            return (
              <Link key={f.key} href={href} aria-pressed={isActive}>
                <MetricCardButton
                  variant={f.variant}
                  className={isActive ? "ring-1 ring-foreground/40" : undefined}
                >
                  <MetricCardHeader className="flex w-full items-center justify-between gap-2">
                    <MetricCardTitle>{f.title}</MetricCardTitle>
                    <Icon className="size-4" />
                  </MetricCardHeader>
                  <MetricCardValue>{counts[f.key]}</MetricCardValue>
                </MetricCardButton>
              </Link>
            );
          })}

          {/* p95 card — clicking toggles `?sort=p95`. Active state shows a
              down-arrow indicating "slowest first". */}
          {(() => {
            const isActive = sortByP95;
            const href = buildHref({ sort: isActive ? null : "p95" });
            const Icon = isActive ? ArrowDownIcon : ListFilterIcon;
            return (
              <Link href={href} aria-pressed={isActive}>
                <MetricCardButton
                  variant="default"
                  className={isActive ? "ring-1 ring-foreground/40" : undefined}
                >
                  <MetricCardHeader className="flex w-full items-center justify-between gap-2">
                    <MetricCardTitle>p95 (24h)</MetricCardTitle>
                    <Icon className="size-4" />
                  </MetricCardHeader>
                  <MetricCardValue>{globalP95 != null ? `${globalP95} ms` : "—"}</MetricCardValue>
                </MetricCardButton>
              </Link>
            );
          })()}
        </MetricCardGroup>
      </Section>

      <Section>
        <MonitorsTable
          rows={sorted.map((m) => ({
            id: m.id,
            slug: m.slug,
            name: m.name,
            url: m.url,
            intervalSeconds: m.intervalSeconds,
            enabled: m.enabled,
            currentStatus: m.currentStatus,
            lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
            lastIncidentAt: lastIncidentByMonitor.get(m.id)?.toISOString() ?? null,
            p95Ms: p95ByMonitor.get(m.id) ?? null,
          }))}
        />
      </Section>
    </SectionGroup>
  );
}

function isMonitorStatus(s: string | undefined): s is MonitorStatus {
  return s === "up" || s === "down" || s === "degraded" || s === "unknown";
}
