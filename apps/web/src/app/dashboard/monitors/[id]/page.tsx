import {
  phaseBuckets as fetchPhaseBuckets,
  latencyStats,
  regionLatency,
  regionLatencyBuckets,
} from "@openmonitor/clickhouse";
import { and, db, eq, isNull, or, schema } from "@openmonitor/db";
import {
  Card,
  MetricCard,
  MetricCardGroup,
  MetricCardHeader,
  MetricCardTitle,
  MetricCardValue,
  type MetricCardVariant,
  RegionLatencyChart,
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
import { monitorIdFrom } from "~/lib/resolve-entity";
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
  const { id: idOrSlug } = await params;
  const sp = await searchParams;
  // Pin URL params to the allowlists so a tampered query doesn't leak into
  // the SQL — defaults match openstatus's chart (P50 / 30 minutes).
  const quantile: Quantile = QUANTILES.find((q) => q.value === sp.q)?.value ?? "p50";
  const resolution: Resolution = RESOLUTIONS.find((r) => r.value === sp.r)?.value ?? "30";
  const quantileNumber = QUANTILE_TO_NUMBER[quantile];
  const bucketMinutes = Number.parseInt(resolution, 10);
  const workspaceId = await getCurrentWorkspaceId();
  const id = await monitorIdFrom(idOrSlug, workspaceId);
  const conn = db();
  const [monitor] = await conn
    .select()
    .from(schema.monitors)
    .where(and(eq(schema.monitors.id, id), eq(schema.monitors.workspaceId, workspaceId)))
    .limit(1);
  if (!monitor) notFound();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const bucketSeconds = bucketMinutes * 60;

  // All three ClickHouse reads at once — they don't depend on each other, and
  // serially they cost three round trips, which is the whole page load when
  // ClickHouse isn't in the same region as this function.
  //
  // regionStats:   per-region percentiles plus an hourly-mean sparkline.
  // stats:         status counts and the five latency percentiles over 24h.
  // buckets:       per-phase latency, bucketed by the chart's r= control.
  // regionBuckets: the same window split per region, for the lines chart.
  const [regionStats, stats, buckets, regionBuckets] = await Promise.all([
    regionLatency(id, since),
    latencyStats(id, since),
    fetchPhaseBuckets(id, since, bucketSeconds, quantileNumber),
    regionLatencyBuckets(id, since, bucketSeconds, quantileNumber),
  ]);

  const regionStatuses = await conn
    .select({
      region: schema.monitorRegionStatus.region,
      status: schema.monitorRegionStatus.status,
    })
    .from(schema.monitorRegionStatus)
    .where(eq(schema.monitorRegionStatus.monitorId, id));
  const statusByRegion = new Map(regionStatuses.map((r) => [r.region, r.status]));

  // Shared locations (workspaceId IS NULL) are the operator's fleet and a
  // monitor can be assigned to one, so they need naming too — otherwise the
  // chart legend and the table fall back to the raw region code.
  const locationNames = await conn
    .select({ region: schema.probeLocations.region, name: schema.probeLocations.name })
    .from(schema.probeLocations)
    .where(
      or(
        isNull(schema.probeLocations.workspaceId),
        eq(schema.probeLocations.workspaceId, workspaceId),
      ),
    );
  const nameByRegion = new Map(locationNames.map((l) => [l.region, l.name]));
  const regionLabels = Object.fromEntries(nameByRegion);

  const regions: RegionRow[] = regionStats.map((r) => ({
    code: r.region,
    name: nameByRegion.get(r.region) ?? r.region,
    status: statusByRegion.get(r.region) ?? "unknown",
    trend: r.trend,
    p50: r.p50,
    p90: r.p90,
    p99: r.p99,
    min: r.min,
    max: r.max,
  }));

  const { total, ok, degraded, failing } = stats;
  const uptimePct = total === 0 ? null : (ok / total) * 100;

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

      <section className="flex flex-col gap-4">
        <div>
          <SectionTitle>Latency by region</SectionTitle>
          <p className="font-mono text-muted-foreground text-sm tracking-tight">
            One line per probe location, same quantile and resolution as above
          </p>
        </div>
        <Card className="p-5">
          <RegionLatencyChart data={regionBuckets} labels={regionLabels} />
        </Card>
      </section>

      <MonitorRegions regions={regions} monitorId={idOrSlug} />

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
