import { type ClickHouseClient, createClient } from "@clickhouse/client";

export type { ClickHouseClient };

/**
 * ClickHouse holds `monitor_runs` — the only table that grows with time.
 *
 * Everything relational stays in Postgres. This split exists because a probe
 * result is append-only telemetry queried exclusively in aggregate, which is
 * the shape columnar storage is for: measured on real data, a row costs ~2
 * bytes here against ~326 in Postgres (144 of heap plus 182 of index, on a
 * table whose primary key nothing ever looked up by).
 *
 * That difference is what makes per-region probing affordable. `region` and
 * `status` compress to hundredths of a byte per row, so adding a region costs
 * almost nothing, where in Postgres it multiplied the whole row.
 */
export function createChClient(url: string): ClickHouseClient {
  return createClient({
    url,
    database: process.env.CLICKHOUSE_DATABASE ?? "openmonitor",
    // Local compose runs with no password. A ClickHouse that anything else can
    // reach needs one.
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    clickhouse_settings: {
      // ClickHouse writes a part per INSERT and merges them in the background.
      // A probe result per request would produce parts faster than merges
      // retire them, and the server starts rejecting writes with "too many
      // parts". Async inserts batch server-side instead, so the ingest route
      // can stay one-row-per-request.
      async_insert: 1,
      // Don't block the probe response on the buffer flushing. A probe result
      // is telemetry: losing the tail of a buffer on an unclean shutdown costs
      // a point on a chart, and the alerting path doesn't read this table.
      wait_for_async_insert: 0,
    },
  });
}

let cached: ClickHouseClient | undefined;

export function ch(): ClickHouseClient {
  if (!cached) {
    const url = process.env.CLICKHOUSE_URL;
    if (!url) throw new Error("CLICKHOUSE_URL must be set");
    cached = createChClient(url);
  }
  return cached;
}
