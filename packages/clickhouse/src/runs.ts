import { ch } from "./client";

export type MonitorStatus = "up" | "degraded" | "down" | "unknown";

export type ProbeRun = {
  monitorId: string;
  workspaceId: string;
  region: string;
  status: MonitorStatus;
  statusCode?: number | null;
  latencyMs?: number | null;
  latencyDnsMs?: number | null;
  latencyConnectMs?: number | null;
  latencyTlsMs?: number | null;
  latencyTtfbMs?: number | null;
  latencyTransferMs?: number | null;
  error?: string | null;
  checkedAt: Date;
};

/** ClickHouse has no NULL here — the columns are non-nullable for compression. */
const n = (v: number | null | undefined) => v ?? 0;

/** `DateTime` wants 'YYYY-MM-DD hh:mm:ss' in UTC, not an ISO string. */
function toChDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Append probe results.
 *
 * Takes an array so the caller can batch, though the ingest route passes one:
 * `async_insert` batches server-side, which is what keeps a part explosion off
 * the table without the API holding a buffer across requests.
 */
export async function insertRuns(runs: ProbeRun[], opts?: { wait?: boolean }): Promise<void> {
  if (runs.length === 0) return;
  await ch().insert({
    table: "monitor_runs",
    format: "JSONEachRow",
    // The seed waits: it prints "seeded N results" and the user opens the
    // dashboard immediately, so the rows have to be queryable by then. The
    // ingest path doesn't — a probe result is telemetry and the buffer flushes
    // within a second.
    clickhouse_settings: opts?.wait ? { wait_for_async_insert: 1 } : undefined,
    values: runs.map((r) => ({
      monitor_id: r.monitorId,
      workspace_id: r.workspaceId,
      region: r.region,
      status: r.status,
      status_code: n(r.statusCode),
      latency_ms: n(r.latencyMs),
      latency_dns_ms: n(r.latencyDnsMs),
      latency_connect_ms: n(r.latencyConnectMs),
      latency_tls_ms: n(r.latencyTlsMs),
      latency_ttfb_ms: n(r.latencyTtfbMs),
      latency_transfer_ms: n(r.latencyTransferMs),
      error: r.error ?? "",
      checked_at: toChDateTime(r.checkedAt),
    })),
  });
}

async function rows<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
  const rs = await ch().query({ query, query_params: params, format: "JSONEachRow" });
  return rs.json<T>();
}

export type DayBucket = {
  date: string;
  total: number;
  ok: number;
  degraded: number;
  down: number;
  unknown: number;
};

/**
 * Daily uptime buckets in the status page's timezone.
 *
 * The timezone is applied at read time over raw rows. That's the reason this
 * table didn't need a rollup: pre-aggregating into days would have meant
 * freezing one timezone, and every page configured for another would show days
 * of 23 or 25 hours on its tracker.
 *
 * Days with no probes still appear, with zeros — the tracker renders a gap
 * rather than silently shortening the window.
 */
export type DayBucketFor = DayBucket & { monitorId: string };

/** Daily buckets for several monitors in one query, for pages listing many. */
export async function dailyBucketsMany(
  monitorIds: string[],
  days: number,
  tz: string,
): Promise<DayBucketFor[]> {
  if (monitorIds.length === 0) return [];
  return rows<DayBucketFor>(
    `
    SELECT
      toString(m.monitor_id)         AS monitorId,
      formatDateTime(d, '%Y-%m-%d')  AS date,
      toUInt32(sum(b.total))         AS total,
      toUInt32(sum(b.ok))            AS ok,
      toUInt32(sum(b.degraded))      AS degraded,
      toUInt32(sum(b.down))          AS down,
      toUInt32(sum(b.unknown))       AS unknown
    FROM (
      SELECT arrayJoin({monitorIds:Array(UUID)}) AS monitor_id
    ) AS m
    CROSS JOIN (
      SELECT toDate(toTimeZone(now(), {tz:String})) - arrayJoin(range({days:UInt32})) AS d
    ) AS days_axis
    LEFT JOIN (
      SELECT
        monitor_id,
        toDate(toTimeZone(checked_at, {tz:String})) AS d,
        count()                      AS total,
        countIf(status = 'up')       AS ok,
        countIf(status = 'degraded') AS degraded,
        countIf(status = 'down')     AS down,
        countIf(status = 'unknown')  AS unknown
      FROM monitor_runs
      WHERE monitor_id IN {monitorIds:Array(UUID)}
        AND checked_at >= toDateTime(
              toDate(toTimeZone(now(), {tz:String})) - ({days:UInt32} - 1), {tz:String})
      GROUP BY monitor_id, d
    ) AS b USING (monitor_id, d)
    GROUP BY m.monitor_id, d
    ORDER BY m.monitor_id, d ASC
    `,
    { monitorIds, days, tz },
  );
}

export async function dailyBuckets(
  monitorId: string,
  days: number,
  tz: string,
): Promise<DayBucket[]> {
  return rows<DayBucket>(
    `
    SELECT
      formatDateTime(d, '%Y-%m-%d')  AS date,
      toUInt32(sum(b.total))         AS total,
      toUInt32(sum(b.ok))            AS ok,
      toUInt32(sum(b.degraded))      AS degraded,
      toUInt32(sum(b.down))          AS down,
      toUInt32(sum(b.unknown))       AS unknown
    FROM (
      SELECT toDate(toTimeZone(now(), {tz:String})) - arrayJoin(range({days:UInt32})) AS d
    ) AS days_axis
    LEFT JOIN (
      SELECT
        toDate(toTimeZone(checked_at, {tz:String})) AS d,
        count()                      AS total,
        countIf(status = 'up')       AS ok,
        countIf(status = 'degraded') AS degraded,
        countIf(status = 'down')     AS down,
        countIf(status = 'unknown')  AS unknown
      FROM monitor_runs
      WHERE monitor_id = {monitorId:UUID}
        AND checked_at >= toDateTime(
              toDate(toTimeZone(now(), {tz:String})) - ({days:UInt32} - 1), {tz:String})
      GROUP BY d
    ) AS b USING (d)
    GROUP BY d
    ORDER BY d ASC
    `,
    { monitorId, days, tz },
  );
}

export type LatencyBucket = {
  bucket: string;
  avg: number;
  p95: number;
  ok: number;
  total: number;
};

/**
 * Ten-minute latency buckets over the last `hours`.
 *
 * p95 is the one aggregate that can't be derived from a rollup — percentiles
 * aren't additive — so it reads raw rows. ClickHouse computes it natively.
 */
export async function latencyBuckets(monitorId: string, hours: number): Promise<LatencyBucket[]> {
  return rows<LatencyBucket>(
    `
    SELECT
      formatDateTime(toStartOfInterval(checked_at, INTERVAL 10 MINUTE), '%Y-%m-%dT%H:%i:00Z') AS bucket,
      toUInt32(round(ifNotFinite(avg(latency_ms), 0)))                    AS avg,
      toUInt32(round(ifNotFinite(quantile(0.95)(latency_ms), 0)))         AS p95,
      toUInt32(countIf(status = 'up'))                    AS ok,
      toUInt32(count())                                   AS total
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID}
      AND checked_at >= now() - INTERVAL {hours:UInt32} HOUR
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    { monitorId, hours },
  );
}

/** Uptime ratio over a window, for the badge endpoints. */
export async function uptimeSince(
  monitorId: string,
  since: Date,
): Promise<{ total: number; ok: number }> {
  const [row] = await rows<{ total: number; ok: number }>(
    `
    SELECT toUInt32(count()) AS total, toUInt32(countIf(status = 'up')) AS ok
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID} AND checked_at >= {since:DateTime}
    `,
    { monitorId, since: toChDateTime(since) },
  );
  return { total: row?.total ?? 0, ok: row?.ok ?? 0 };
}

/** Row count for the System page. */
export async function countRuns(): Promise<number> {
  const [row] = await rows<{ n: string }>(`SELECT toString(count()) AS n FROM monitor_runs`, {});
  return Number(row?.n ?? 0);
}

export type RunRow = {
  id: string;
  checkedAt: string;
  status: MonitorStatus;
  statusCode: number | null;
  latencyMs: number | null;
  region: string;
  error: string | null;
  dns: number | null;
  connect: number | null;
  tls: number | null;
  ttfb: number | null;
  transfer: number | null;
};

/**
 * Most recent raw probe results, for the admin logs table.
 *
 * The only reader that wants individual rows rather than an aggregate, which
 * is why raw data is kept at full resolution instead of being rolled up.
 *
 * There's no `id` column — ClickHouse has no sequences and a UUID per row would
 * cost more than the rest of the row put together — so the key is synthesised
 * from the columns that identify a probe. The table only needs it for React.
 */
export async function recentRuns(monitorId: string, limit: number): Promise<RunRow[]> {
  const raw = await rows<{
    checked_at: string;
    status: MonitorStatus;
    status_code: number;
    latency_ms: number;
    region: string;
    error: string;
    dns: number;
    connect: number;
    tls: number;
    ttfb: number;
    transfer: number;
  }>(
    `
    SELECT
      formatDateTime(checked_at, '%Y-%m-%dT%H:%i:%SZ') AS checked_at,
      status, status_code, latency_ms, region, error,
      latency_dns_ms AS dns, latency_connect_ms AS connect, latency_tls_ms AS tls,
      latency_ttfb_ms AS ttfb, latency_transfer_ms AS transfer
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID}
    ORDER BY checked_at DESC
    LIMIT {limit:UInt32}
    `,
    { monitorId, limit },
  );

  // 0 is the sentinel for "not measured" on the wire; restore null so the UI
  // can tell a missing phase timing from a genuinely instant one.
  const orNull = (v: number) => (v === 0 ? null : v);
  return raw.map((r) => ({
    id: `${r.checked_at}-${r.region}`,
    checkedAt: r.checked_at,
    status: r.status,
    statusCode: orNull(r.status_code),
    latencyMs: orNull(r.latency_ms),
    region: r.region,
    error: r.error === "" ? null : r.error,
    dns: orNull(r.dns),
    connect: orNull(r.connect),
    tls: orNull(r.tls),
    ttfb: orNull(r.ttfb),
    transfer: orNull(r.transfer),
  }));
}

/** Total probe results recorded for a monitor, for the logs page counter. */
export async function countRunsFor(monitorId: string): Promise<number> {
  const [row] = await rows<{ n: string }>(
    `SELECT toString(count()) AS n FROM monitor_runs WHERE monitor_id = {monitorId:UUID}`,
    { monitorId },
  );
  return Number(row?.n ?? 0);
}

export type LatencyStats = {
  total: number;
  ok: number;
  degraded: number;
  failing: number;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
};

/** Status counts plus the five latency percentiles, in one round trip. */
export async function latencyStats(monitorId: string, since: Date): Promise<LatencyStats> {
  const [row] = await rows<{
    total: number;
    ok: number;
    degraded: number;
    failing: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  }>(
    `
    SELECT
      toUInt32(count())                    AS total,
      toUInt32(countIf(status = 'up'))       AS ok,
      toUInt32(countIf(status = 'degraded')) AS degraded,
      toUInt32(countIf(status = 'down'))     AS failing,
      toUInt32(round(ifNotFinite(quantile(0.50)(latency_ms), 0))) AS p50,
      toUInt32(round(ifNotFinite(quantile(0.75)(latency_ms), 0))) AS p75,
      toUInt32(round(ifNotFinite(quantile(0.90)(latency_ms), 0))) AS p90,
      toUInt32(round(ifNotFinite(quantile(0.95)(latency_ms), 0))) AS p95,
      toUInt32(round(ifNotFinite(quantile(0.99)(latency_ms), 0))) AS p99
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID} AND checked_at >= {since:DateTime}
    `,
    { monitorId, since: toChDateTime(since) },
  );
  const empty = !row || row.total === 0;
  return {
    total: row?.total ?? 0,
    ok: row?.ok ?? 0,
    degraded: row?.degraded ?? 0,
    failing: row?.failing ?? 0,
    // Percentiles of nothing are 0, which would render as "0 ms" rather than
    // "no data". Only meaningful when there were samples.
    p50: empty ? null : (row?.p50 ?? null),
    p75: empty ? null : (row?.p75 ?? null),
    p90: empty ? null : (row?.p90 ?? null),
    p95: empty ? null : (row?.p95 ?? null),
    p99: empty ? null : (row?.p99 ?? null),
  };
}

export type PhaseBucket = {
  bucket: string;
  avg: number;
  p95: number;
  ok: number;
  degraded: number;
  down: number;
  total: number;
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  transfer: number;
  phaseSamples: number;
};

/**
 * Latency broken down by request phase, bucketed to `bucketSeconds`.
 *
 * `quantile` is chart-driven (the q= control), so phase timings and the total
 * use the same statistic and the stacked bars stay coherent.
 */
export async function phaseBuckets(
  monitorId: string,
  since: Date,
  bucketSeconds: number,
  quantile: number,
): Promise<PhaseBucket[]> {
  return rows<PhaseBucket>(
    `
    SELECT
      formatDateTime(toStartOfInterval(checked_at, INTERVAL {bucketSeconds:UInt32} SECOND),
                     '%Y-%m-%dT%H:%i:00Z')                          AS bucket,
      toUInt32(round(ifNotFinite(avg(latency_ms), 0)))                        AS avg,
      toUInt32(round(ifNotFinite(quantile(0.95)(latency_ms), 0)))             AS p95,
      toUInt32(countIf(status = 'up'))                        AS ok,
      toUInt32(countIf(status = 'degraded'))                  AS degraded,
      toUInt32(countIf(status = 'down'))                      AS down,
      toUInt32(count())                                       AS total,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_dns_ms), 0)))      AS dns,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_connect_ms), 0)))  AS connect,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_tls_ms), 0)))      AS tls,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_ttfb_ms), 0)))     AS ttfb,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_transfer_ms), 0))) AS transfer,
      toUInt32(countIf(latency_ttfb_ms > 0))                  AS phaseSamples
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID} AND checked_at >= {since:DateTime}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    { monitorId, since: toChDateTime(since), bucketSeconds, q: quantile },
  );
}

export type RegionLatencyBucket = {
  bucket: string;
  region: string;
  value: number;
};

/**
 * Per-region latency over time, long format — one row per (bucket, region).
 *
 * Long rather than wide because regions aren't known at query time and
 * ClickHouse can't pivot to dynamic columns; the chart widens it. Buckets a
 * region has no probes in are simply absent, which recharts renders as a gap
 * rather than a drop to zero.
 */
export async function regionLatencyBuckets(
  monitorId: string,
  since: Date,
  bucketSeconds: number,
  quantile: number,
): Promise<RegionLatencyBucket[]> {
  return rows<RegionLatencyBucket>(
    `
    SELECT
      formatDateTime(toStartOfInterval(checked_at, INTERVAL {bucketSeconds:UInt32} SECOND),
                     '%Y-%m-%dT%H:%i:00Z')                              AS bucket,
      region                                                            AS region,
      toUInt32(round(ifNotFinite(quantile({q:Float64})(latency_ms), 0))) AS value
    FROM monitor_runs
    WHERE monitor_id = {monitorId:UUID}
      AND checked_at >= {since:DateTime}
      -- 0 is the "not measured" sentinel, not a real 0ms response.
      AND latency_ms > 0
    GROUP BY bucket, region
    ORDER BY bucket ASC, region ASC
    `,
    { monitorId, since: toChDateTime(since), bucketSeconds, q: quantile },
  );
}

/**
 * p95 latency per monitor over a window, plus the workspace-wide figure.
 *
 * One query for the whole list page rather than one per monitor. The overall
 * value is computed across all rows, not averaged from the per-monitor ones —
 * a percentile of percentiles isn't a percentile.
 */
export async function p95ByMonitor(
  monitorIds: string[],
  since: Date,
): Promise<{ perMonitor: Map<string, number | null>; overall: number | null }> {
  const perMonitor = new Map<string, number | null>();
  if (monitorIds.length === 0) return { perMonitor, overall: null };

  const params = { monitorIds, since: toChDateTime(since) };
  const per = await rows<{ monitor_id: string; p95: number; n: number }>(
    `
    SELECT monitor_id,
           toUInt32(round(ifNotFinite(quantile(0.95)(latency_ms), 0))) AS p95,
           toUInt32(count()) AS n
    FROM monitor_runs
    WHERE monitor_id IN {monitorIds:Array(UUID)} AND checked_at >= {since:DateTime}
    GROUP BY monitor_id
    `,
    params,
  );
  for (const r of per) perMonitor.set(r.monitor_id, r.n === 0 ? null : r.p95);

  const [all] = await rows<{ p95: number; n: number }>(
    `
    SELECT toUInt32(round(ifNotFinite(quantile(0.95)(latency_ms), 0))) AS p95, toUInt32(count()) AS n
    FROM monitor_runs
    WHERE monitor_id IN {monitorIds:Array(UUID)} AND checked_at >= {since:DateTime}
    `,
    params,
  );
  return { perMonitor, overall: !all || all.n === 0 ? null : all.p95 };
}

/** Wipe the table, so re-running the seed doesn't stack duplicate history. */
export async function truncateRuns(): Promise<void> {
  await ch().command({ query: "TRUNCATE TABLE IF EXISTS monitor_runs" });
}

export type RegionLatency = {
  region: string;
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
  /** Hourly means, oldest first, for the sparkline. */
  trend: number[];
};

/**
 * Per-region latency for one monitor's Regions panel.
 *
 * Percentiles come from raw rows; the trend is hourly means so the sparkline
 * has a stable number of points whatever the probe interval. Regions whose
 * probe location has since been deleted still appear — dropping them would
 * silently hide history.
 *
 * Two queries rather than one: the percentiles group by region, the trend
 * groups by region *and* hour, and expressing both at once needs a nested
 * aggregate that reads worse than the round trip costs.
 */
export async function regionLatency(monitorId: string, since: Date): Promise<RegionLatency[]> {
  const params = { monitorId, since: toChDateTime(since) };
  // latency_ms = 0 is the "not measured" sentinel, not a real 0ms response.
  const where = `
    WHERE monitor_id = {monitorId:UUID}
      AND checked_at >= {since:DateTime}
      AND latency_ms > 0`;

  const [stats, trends] = await Promise.all([
    rows<{ region: string; p50: number; p90: number; p99: number; min: number; max: number }>(
      `
      SELECT region,
             toUInt32(round(ifNotFinite(quantile(0.50)(latency_ms), 0))) AS p50,
             toUInt32(round(ifNotFinite(quantile(0.90)(latency_ms), 0))) AS p90,
             toUInt32(round(ifNotFinite(quantile(0.99)(latency_ms), 0))) AS p99,
             toUInt32(min(latency_ms)) AS min,
             toUInt32(max(latency_ms)) AS max
      FROM monitor_runs ${where}
      GROUP BY region ORDER BY region
      `,
      params,
    ),
    rows<{ region: string; trend: number[] }>(
      `
      SELECT region, groupArray(mean) AS trend
      FROM (
        SELECT region, toStartOfHour(checked_at) AS hour,
               toUInt32(round(ifNotFinite(avg(latency_ms), 0))) AS mean
        FROM monitor_runs ${where}
        GROUP BY region, hour
        ORDER BY region, hour
      )
      GROUP BY region
      `,
      params,
    ),
  ]);

  const trendByRegion = new Map(trends.map((t) => [t.region, t.trend]));
  return stats.map((s) => ({ ...s, trend: trendByRegion.get(s.region) ?? [] }));
}
