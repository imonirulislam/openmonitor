import { createClient } from "@clickhouse/client";

/**
 * Schema for the probe-results table.
 *
 * Applied with `CREATE ... IF NOT EXISTS` rather than a numbered migration
 * chain like Postgres has. There is one table, it's append-only, and nothing
 * references it — so the interesting migrations (backfills, constraint changes,
 * renames) don't arise. If that stops being true, add a proper chain rather
 * than growing this.
 *
 * Design notes, since each choice is load-bearing for the storage numbers:
 *
 * - `ORDER BY (monitor_id, region, checked_at)` matches every read: all four
 *   are "one monitor, a time range, grouped". It also sorts equal values
 *   adjacently, which is what lets the codecs work.
 * - `Delta` on `checked_at` because probes arrive at a fixed interval, so the
 *   deltas are a constant and compress to almost nothing.
 * - `T64` on the latency integers — it transposes the bit planes of a block of
 *   integers, which pays off when values share high-order bits, as latencies
 *   in milliseconds do.
 * - `LowCardinality(String)` for `region`: stored as a dictionary index, so a
 *   region name costs ~0.006 bytes/row however long it is.
 * - `PARTITION BY toYYYYMM` so the TTL drops whole parts instead of rewriting
 *   them.
 */
export const MONITOR_RUNS_DDL = (retentionDays: number) => `
CREATE TABLE IF NOT EXISTS monitor_runs
(
  monitor_id          UUID,
  workspace_id        UUID,
  region              LowCardinality(String),
  status              Enum8('up' = 1, 'degraded' = 2, 'down' = 3, 'unknown' = 4),
  status_code         UInt16 CODEC(T64, ZSTD(1)),
  latency_ms          UInt32 CODEC(T64, ZSTD(1)),
  latency_dns_ms      UInt32 CODEC(T64, ZSTD(1)),
  latency_connect_ms  UInt32 CODEC(T64, ZSTD(1)),
  latency_tls_ms      UInt32 CODEC(T64, ZSTD(1)),
  latency_ttfb_ms     UInt32 CODEC(T64, ZSTD(1)),
  latency_transfer_ms UInt32 CODEC(T64, ZSTD(1)),
  error               String CODEC(ZSTD(3)),
  checked_at          DateTime CODEC(Delta, ZSTD(1))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(checked_at)
ORDER BY (monitor_id, region, checked_at)
TTL checked_at + INTERVAL ${retentionDays} DAY
`;

/**
 * Create the database and table if they aren't there.
 *
 * Idempotent, so the migrate step can run it on every deploy. Retention is a
 * TTL clause rather than a sweep job: ClickHouse drops expired parts during
 * background merges, which is why there's no cron entry for this table.
 */
export async function ensureSchema(url: string, retentionDays = 180): Promise<void> {
  const database = process.env.CLICKHOUSE_DATABASE ?? "openmonitor";

  // Two clients on purpose. The HTTP interface resolves `database` before it
  // runs anything, so a client scoped to a database that doesn't exist yet
  // fails on the statement that would have created it. Bootstrap through
  // `default`, then reconnect to do the rest.
  const bootstrap = createClient({ url, database: "default" });
  try {
    await bootstrap.command({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });
  } finally {
    await bootstrap.close();
  }

  const client = createClient({ url, database });
  try {
    await client.command({ query: MONITOR_RUNS_DDL(retentionDays) });
  } finally {
    await client.close();
  }
}
