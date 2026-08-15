import { and, db, eq, gte, schema, sql } from "@openmonitor/db";
import {
  Card,
  MetricCard,
  MetricCardGroup,
  MetricCardHeader,
  MetricCardTitle,
  MetricCardValue,
  type MetricCardVariant,
  SectionTitle,
  TimingPhasesChart,
} from "@openmonitor/ui";
import { formatDistanceToNowStrict } from "date-fns";
import { notFound } from "next/navigation";
import { LatencyChart } from "~/components/latency-chart";
import { LatencyChartControls } from "~/components/latency-chart-controls";
import {
  QUANTILES,
  type Quantile,
  RESOLUTIONS,
  type Resolution,
} from "~/components/latency-chart-options";
import { MonitorRegions, type RegionRow } from "~/components/monitor-regions";
import { MonitorTimeline } from "~/components/monitor-timeline";
import { getCurrentWorkspaceId } from "~/lib/workspace";

const QUANTILE_TO_NUMBER: Record<Quantile, number> = {
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; r?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Pin URL params to the allowlists so a tampered query doesn't leak into
  // the SQL — defaults match openstatus's chart (P50 / 30 minutes).
  const quantile: Quantile = QUANTILES.find((q) => q.value === sp.q)?.value ?? "p50";
  const resolution: Resolution = RESOLUTIONS.find((r) => r.value === sp.r)?.value ?? "30";
  const quantileNumber = QUANTILE_TO_NUMBER[quantile];
  const bucketMinutes = Number.parseInt(resolution, 10);
  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();
  const [monitor] = await conn
    .select()
    .from(schema.monitors)
    .where(and(eq(schema.monitors.id, id), eq(schema.monitors.workspaceId, workspaceId)))
    .limit(1);
  if (!monitor) notFound();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Per-region latency for the Regions panel. Percentiles come from the raw
  // runs; the trend is hourly means so the sparkline has a stable number of
  // points regardless of probe interval. Runs whose region no longer has a
  // location still show up — dropping them would silently hide history.
  const regionStats = (await conn.execute(sql`
    WITH runs AS (
      SELECT region, latency_ms, date_trunc('hour', checked_at) AS hour
      FROM monitor_runs
      -- ISO string + explicit cast: a JS Date interpolated into a raw sql
      -- template reaches the driver unserialized and throws ERR_INVALID_ARG_TYPE.
      WHERE monitor_id = ${id}
        AND checked_at >= ${since.toISOString()}::timestamptz
        AND latency_ms IS NOT NULL
    ),
    hourly AS (
      SELECT region, hour, avg(latency_ms) AS mean FROM runs GROUP BY region, hour
    )
    SELECT
      r.region,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY r.latency_ms) AS p50,
      percentile_cont(0.9)  WITHIN GROUP (ORDER BY r.latency_ms) AS p90,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY r.latency_ms) AS p99,
      min(r.latency_ms) AS min,
      max(r.latency_ms) AS max,
      (SELECT array_agg(round(h.mean) ORDER BY h.hour)
         FROM hourly h WHERE h.region = r.region) AS trend
    FROM runs r
    GROUP BY r.region
    ORDER BY r.region
  `)) as unknown as Array<{
    region: string;
    p50: string | number | null;
    p90: string | number | null;
    p99: string | number | null;
    min: number | null;
    max: number | null;
    trend: Array<string | number> | null;
  }>;

  const regionStatuses = await conn
    .select({
      region: schema.monitorRegionStatus.region,
      status: schema.monitorRegionStatus.status,
    })
    .from(schema.monitorRegionStatus)
    .where(eq(schema.monitorRegionStatus.monitorId, id));
  const statusByRegion = new Map(regionStatuses.map((r) => [r.region, r.status]));

  const locationNames = await conn
    .select({ region: schema.probeLocations.region, name: schema.probeLocations.name })
    .from(schema.probeLocations)
    .where(eq(schema.probeLocations.workspaceId, workspaceId));
  const nameByRegion = new Map(locationNames.map((l) => [l.region, l.name]));

  const num = (v: string | number | null | undefined) => Math.round(Number(v ?? 0));
  const regions: RegionRow[] = regionStats.map((r) => ({
    code: r.region,
    name: nameByRegion.get(r.region) ?? r.region,
    status: statusByRegion.get(r.region) ?? "unknown",
    trend: (r.trend ?? []).map((n) => Number(n)),
    p50: num(r.p50),
    p90: num(r.p90),
    p99: num(r.p99),
    min: num(r.min),
    max: num(r.max),
  }));

  // Aggregate stats over the 24h window — counts by status + all five
  // latency percentiles in one round-trip.
  const [stats] = await conn
    .select({
      total: sql<number>`count(*)::int`,
      ok: sql<number>`sum(case when ${schema.monitorRuns.status} = 'up' then 1 else 0 end)::int`,
      degraded: sql<number>`sum(case when ${schema.monitorRuns.status} = 'degraded' then 1 else 0 end)::int`,
      failing: sql<number>`sum(case when ${schema.monitorRuns.status} = 'down' then 1 else 0 end)::int`,
      p50: sql<
        number | null
      >`(percentile_cont(0.5) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
      p75: sql<
        number | null
      >`(percentile_cont(0.75) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
      p90: sql<
        number | null
      >`(percentile_cont(0.9) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
      p95: sql<
        number | null
      >`(percentile_cont(0.95) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
      p99: sql<
        number | null
      >`(percentile_cont(0.99) within group (order by ${schema.monitorRuns.latencyMs}))::int`,
    })
    .from(schema.monitorRuns)
    .where(and(eq(schema.monitorRuns.monitorId, id), gte(schema.monitorRuns.checkedAt, since)));

  const total = stats?.total ?? 0;
  const ok = stats?.ok ?? 0;
  const degraded = stats?.degraded ?? 0;
  const failing = stats?.failing ?? 0;
  const uptimePct = total === 0 ? null : (ok / total) * 100;

  // Per-bucket latency aggregates over the 24h window. `bucketMinutes` and
  // `quantileNumber` come from the URL-driven chart controls (q + r). Bucket
  // start is computed as `floor(epoch / N) * N` so any minute resolution
  // works without hand-rolled cases for each option. Phase percentiles use
  // the same quantile as the total to keep the chart coherent.
  const bucketSeconds = bucketMinutes * 60;
  const buckets = await conn
    .select({
      bucket: sql<string>`to_char(to_timestamp(floor(extract(epoch from checked_at) / ${bucketSeconds})::bigint * ${bucketSeconds}), 'YYYY-MM-DD"T"HH24:MI:00Z')`,
      avg: sql<number>`coalesce(round(avg(latency_ms))::int, 0)`,
      p95: sql<number>`coalesce((percentile_cont(0.95) within group (order by latency_ms))::int, 0)`,
      ok: sql<number>`sum(case when status = 'up' then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
      dns: sql<number>`coalesce((percentile_cont(${quantileNumber}) within group (order by latency_dns_ms))::int, 0)`,
      connect: sql<number>`coalesce((percentile_cont(${quantileNumber}) within group (order by latency_connect_ms))::int, 0)`,
      tls: sql<number>`coalesce((percentile_cont(${quantileNumber}) within group (order by latency_tls_ms))::int, 0)`,
      ttfb: sql<number>`coalesce((percentile_cont(${quantileNumber}) within group (order by latency_ttfb_ms))::int, 0)`,
      transfer: sql<number>`coalesce((percentile_cont(${quantileNumber}) within group (order by latency_transfer_ms))::int, 0)`,
      phaseSamples: sql<number>`count(latency_ttfb_ms)::int`,
    })
    .from(schema.monitorRuns)
    .where(and(eq(schema.monitorRuns.monitorId, id), gte(schema.monitorRuns.checkedAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // If we have any rows with phase instrumentation in the window, prefer the
  // stacked phases view; otherwise fall back to the legacy avg/p95 chart so
  // pre-instrumentation deployments still show something.
  const hasPhaseData = buckets.some((b) => b.phaseSamples > 0);
  const phaseBuckets = buckets.map((b) => ({
    bucket: b.bucket,
    dns: b.dns,
    connect: b.connect,
    tls: b.tls,
    ttfb: b.ttfb,
    transfer: b.transfer,
  }));

  return (
    <div className="flex flex-col gap-10">
      <MetricCardGroup>
        <BigMetric
          label="Uptime"
          value={uptimePct != null ? `${uptimePct.toFixed(2)}%` : "—"}
          variant="success"
        />
        <BigMetric label="Degraded" value={degraded.toString()} variant="warning" />
        <BigMetric label="Failing" value={failing.toString()} variant="destructive" />
        <BigMetric label="Requests" value={total.toLocaleString()} variant="default" />
        <BigMetric
          label="Last Checked"
          value={
            monitor.lastCheckedAt
              ? formatDistanceToNowStrict(monitor.lastCheckedAt, { addSuffix: true })
              : "—"
          }
          variant="default"
          big={false}
        />
      </MetricCardGroup>

      <MetricCardGroup>
        <BigMetric
          label="P50"
          value={stats?.p50 != null ? `${stats.p50} ms` : "—"}
          variant="default"
        />
        <BigMetric
          label="P75"
          value={stats?.p75 != null ? `${stats.p75} ms` : "—"}
          variant="default"
        />
        <BigMetric
          label="P90"
          value={stats?.p90 != null ? `${stats.p90} ms` : "—"}
          variant="default"
        />
        <BigMetric
          label="P95"
          value={stats?.p95 != null ? `${stats.p95} ms` : "—"}
          variant="default"
        />
        <BigMetric
          label="P99"
          value={stats?.p99 != null ? `${stats.p99} ms` : "—"}
          variant="default"
        />
      </MetricCardGroup>

      <section className="flex flex-col gap-4">
        <div>
          <SectionTitle>Latency</SectionTitle>
          <p className="font-mono text-muted-foreground text-sm tracking-tight">
            Response time across all the regions
          </p>
        </div>
        {hasPhaseData ? <LatencyChartControls quantile={quantile} resolution={resolution} /> : null}
        <Card className="p-5">
          {hasPhaseData ? (
            <TimingPhasesChart data={phaseBuckets} resolutionMinutes={bucketMinutes} />
          ) : (
            <LatencyChart data={buckets} />
          )}
        </Card>
      </section>

      <MonitorRegions regions={regions} monitorId={id} />

      <MonitorTimeline monitorId={id} workspaceId={workspaceId} />
    </div>
  );
}

/**
 * Big metric card. Mirrors openstatus's layout: small caps title up-top,
 * big value below. `big={false}` switches the value to plain text size for
 * cards that show relative timestamps ("19 minutes ago") that don't fit
 * comfortably at the larger size.
 */
function BigMetric({
  label,
  value,
  variant,
  big = true,
}: {
  label: string;
  value: string;
  variant: MetricCardVariant;
  big?: boolean;
}) {
  return (
    <MetricCard variant={variant}>
      <MetricCardHeader>
        <MetricCardTitle className="text-[10px] uppercase tracking-wide">{label}</MetricCardTitle>
      </MetricCardHeader>
      <MetricCardValue className={big ? "text-2xl" : "text-base font-medium"}>
        {value}
      </MetricCardValue>
    </MetricCard>
  );
}
