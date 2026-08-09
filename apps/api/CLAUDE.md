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

## Conventions

- **All public endpoints prefix with `/v1`.** Versioning is path-based; bump to `/v2` for
  breaking changes rather than mutating `/v1`.
- **Probe ingestion is the only write path.** Admin writes go through `apps/web` server
  actions hitting `@openmonitor/db` directly. Don't add admin write endpoints here unless
  you've decided to move auth into the API too.
- **State changes that fire notifications insert into `events` in the same transaction**
  as the state change. See `routes/probes.ts` for the pattern. The notifier handles delivery.
- **No auth middleware on public endpoints.** Don't add caching or rate limits here either —
  put them at the ingress/CDN layer in front of the status page.

## Adding a new endpoint

1. Add a route file under `src/routes/`.
2. Register it in `src/index.ts` via `app.route("/", yourRoutes)`.
3. If it writes data, do the write in a `db().transaction(...)` block and emit any events in
   the same transaction.
4. If it accepts input, validate with `@hono/zod-validator` — never trust the request body.

## Environment

See `src/env.ts`. All env vars are validated with Zod at startup; missing or malformed values
crash early with a clear message.
