# packages/clickhouse — Probe results

Holds `monitor_runs` and nothing else. Relational data stays in `@openmonitor/db`.

Measured, same rows: **2.08 bytes** here against **326** in Postgres (144 heap + 182 index).
That's what makes multi-region history fit a free tier. `region` costs 0.006 bytes/row, so
adding a region is nearly free — in Postgres it multiplied the whole row.

## Gotchas

- **`formatDateTime` is not strftime.** `%M` is the month *name*, `%F` renders a mangled date.
  Minutes are `%i`. Use `%Y-%m-%dT%H:%i:%SZ`.
- **Inserts are async** (`async_insert=1, wait_for_async_insert=0`) — a part per probe would
  outrun merges and the server starts rejecting writes. Rows are queryable within ~1s; pass
  `{ wait: true }` when you need them immediately, as the seed does.
- **No NULLs.** Columns are non-nullable for compression; `0` means "not measured" and
  `recentRuns` maps it back to `null`.
- **No `id` column.** `recentRuns` synthesises a React key from `checked_at` + `region`.
- **`WITH … AS alias` can't be referenced inside a subquery** in the same statement. Inline it.
- **Retention is a TTL**, applied at DDL time from `RETENTION_RUN_DAYS`. Changing it needs
  `ALTER TABLE … MODIFY TTL`, not a restart. There is no sweep job.

## Conventions

Queries go in `src/runs.ts` as typed functions — don't export the client. Keeping the SQL in
one file is what made moving off Postgres contained instead of a hunt through five apps.
Parameterise with `{name:Type}` and `query_params`.

No rollup table, deliberately: daily buckets apply the status page's timezone at read time.
Pre-aggregating would freeze one timezone and give every other page 23- or 25-hour days.

`src/schema.ts` is `CREATE TABLE IF NOT EXISTS` — one append-only table nothing references, so
there's no migration chain to maintain. Add a real one if that stops being true.

## Local

```bash
docker compose up -d clickhouse                 # HTTP on 5435
docker compose --profile tools up -d ch-ui      # browser on 5436
bun run --filter @openmonitor/clickhouse migrate
```
