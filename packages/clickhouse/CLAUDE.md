# packages/clickhouse — Probe results

Holds `monitor_runs`, and nothing else. Everything relational stays in `@openmonitor/db`.

## Why it exists

`monitor_runs` was the only table that grew with time, and it grew faster than a free-tier
Postgres could hold. Measured on real data:

| | bytes/row | 5 regions × 4 monitors, 180 days |
|---|---|---|
| Postgres | 326 (144 heap + 182 index) | 1,428 MB |
| ClickHouse | 2.08 | 9.4 MB |

The categorical columns are what make per-region probing affordable — `region` costs 0.006
bytes/row and `status` 0.017, where in Postgres another region multiplied the whole row.

This is the split openstatus makes with Tinybird, which is ClickHouse underneath.

## Consequences worth knowing

- **Retention is a TTL on the table.** ClickHouse drops expired parts during background
  merges. There is no sweep job and no cron entry for probe results. `RETENTION_RUN_DAYS`
  is applied at DDL time in `src/schema.ts`; changing it needs an `ALTER TABLE … MODIFY TTL`,
  not just a restart.
- **No rollup table, deliberately.** Daily buckets apply the status page's timezone at read
  time over raw rows. Pre-aggregating would mean freezing one timezone, and every page
  configured for another would show days of 23 or 25 hours on its tracker.
- **Inserts are async.** `async_insert=1, wait_for_async_insert=0` — a part per probe would
  outrun the merges and the server would start rejecting writes with "too many parts". Rows
  are queryable within about a second. Pass `{ wait: true }` when the caller needs them
  immediately, as the seed does.
- **No NULLs.** Columns are non-nullable for compression; `0` is the "not measured"
  sentinel and `recentRuns` maps it back to `null` for the UI.
- **No `id` column.** ClickHouse has no sequences and a UUID per row would cost more than
  the rest of the row. `recentRuns` synthesises a React key from `checked_at` + `region`.
- **`formatDateTime` is not strftime.** `%M` is the month *name* and `%F` renders a mangled
  date. Minutes are `%i`. Use `%Y-%m-%dT%H:%i:%SZ`.

## Adding a query

Put it in `src/runs.ts` as a typed function rather than exporting the client. Callers get a
shaped result and the SQL stays in one file — which is what made porting off Postgres a
contained change rather than a hunt through five apps.

Parameterise with `{name:Type}` and `query_params`. Note that a `WITH … AS alias` cannot be
referenced from inside a subquery in the same statement; inline the expression instead.

## Schema changes

`src/schema.ts` applies `CREATE TABLE IF NOT EXISTS` — there's no numbered migration chain,
because there is one append-only table that nothing references, so the interesting migrations
don't arise. If that stops being true, add a real chain rather than growing `ensureSchema`.

`bun run --filter @openmonitor/clickhouse migrate` applies it; the compose `migrate` service
runs it after the Postgres migrations.

## Local

`docker compose up -d clickhouse` — HTTP on host port 5435. To browse it:

```bash
docker compose --profile tools up -d ch-ui    # http://localhost:5436
```
