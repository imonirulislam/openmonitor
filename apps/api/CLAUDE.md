# apps/api — Hono API server

Public read API for the status page, probe ingestion for the Go checker, and a stub for
inbound Slack webhooks.

## Endpoints

| Method | Path                              | Auth        | Purpose |
|--------|-----------------------------------|-------------|---------|
| GET    | `/health`, `/ready`               | none        | k8s probes |
| GET    | `/v1/status`                      | none        | Aggregate status for the public status page |
| GET    | `/v1/monitors/:slug/history`      | none        | Daily uptime buckets, default 90 days |
| GET    | `/v1/probes/monitors`             | `PROBE_API_KEY` | Checker pulls the list of enabled monitors |
| POST   | `/v1/probes/results`              | `PROBE_API_KEY` | Checker posts probe results |
| POST   | `/webhooks/slack`                 | Slack signing (TODO) | Slash commands / events |
| GET    | `/v1/system/scheduler`            | `PROBE_API_KEY` or `CRON_SECRET` | Retention config + last run + row counts |
| POST   | `/v1/system/scheduler/run`        | `PROBE_API_KEY` or `CRON_SECRET` | Run a retention sweep now |
| GET    | `/v1/system/checker`              | `PROBE_API_KEY` or `CRON_SECRET` | Checker freshness telemetry |

`/v1/system/*` takes two keys because it has two callers with separate lifecycles: the
dashboard's System page uses `PROBE_API_KEY`, and a hosted scheduler sends `CRON_SECRET`
(Vercel Cron attaches that header itself and can't be told to send anything else).

## Conventions

- **All public endpoints prefix with `/v1`.** Versioning is path-based; bump to `/v2` for
  breaking changes rather than mutating `/v1`.
- **Probe ingestion is the only write path.** Admin writes go through `apps/web` server
  actions hitting `@openmonitor/db` directly. Don't add admin write endpoints here unless
  you've decided to move auth into the API too.
- **State changes that fire notifications insert into `events` in the same transaction**
  as the state change. See `routes/probes.ts` for the pattern. The notifier handles delivery.
- **Probe ingestion writes two stores.** The per-region status, derived status, counters and
  the events row commit together in Postgres; the raw result then goes to ClickHouse outside
  that transaction. That insert is allowed to fail — it's logged, not returned, because a 500
  would make the checker re-post and double-count the failure counter behind auto-incidents.
  Never move a *decision* into ClickHouse for the same reason it's outside the transaction.
- **Queries over probe results go through `@openmonitor/clickhouse`**, not raw SQL here.
- **No auth middleware on public endpoints.** Don't add caching or rate limits here either —
  put them at the ingress/CDN layer in front of the status page.

## Adding a new endpoint

1. Add a route file under `src/routes/`.
2. Register it in `src/index.ts` via `app.route("/", yourRoutes)`.
3. If it writes data, do the write in a `db().transaction(...)` block and emit any events in
   the same transaction.
4. If it accepts input, validate with `@hono/zod-validator` — never trust the request body.

## Retention

`src/scheduler.ts` holds both the sweep and an in-process daily timer. The timer is opt-out
via `RETENTION_ENABLED=off` — turn it off wherever external cron drives
`/v1/system/scheduler/run`, and on a multi-replica deployment, or every replica sweeps.

Last-run state lives in `scheduled_task_runs`, not module scope. Under cron every invocation
starts cold, and an in-memory `lastRun` would report "never" forever on a deployment that
sweeps correctly every night. `nextRunAt` is derived from the clock rather than a resident
timer, so it's right whether or not this process is the one that will run it.

## Environment

See `src/env.ts`. All env vars are validated with Zod at startup; missing or malformed values
crash early with a clear message.
