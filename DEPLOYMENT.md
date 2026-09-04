# Deploying OpenMonitor

Two supported shapes. Pick one per service; they are not exclusive across services, and
most deployments mix them.

| | Containers | Serverless |
|---|---|---|
| `apps/web`, `apps/status-page` | `docker compose` | Vercel |
| `apps/api` | `docker compose` / Fly | Vercel |
| `apps/notifier` | `docker compose` / Fly | Vercel + an external pinger (see below) |
| `apps/checker` | Fly / any container host | **not possible** |
| Postgres | `docker compose` | Neon |
| ClickHouse | `docker compose` | a small VM, or managed |

The checker is the one thing with no serverless option. TCP and DNS monitors need raw
sockets, and multi-region probing needs *chosen* egress regions — serverless platforms give
neither. It stays a container. This is also what openstatus does.

---

## Read this before choosing Vercel for the notifier

Vercel Cron on the **Hobby** plan allows 2 jobs, **once per day**, with a 10-second function
timeout. A once-daily outbox drain means alerts arrive up to 24 hours late, which defeats the
point of the tool.

So `apps/notifier/vercel.json` deliberately ships **no `crons` block**. There is no correct
Hobby schedule to put in it. Choose one:

- **Vercel Pro** — add the block yourself:
  ```json
  "crons": [
    { "path": "/cron/drain", "schedule": "* * * * *" },
    { "path": "/cron/sweep", "schedule": "*/5 * * * *" }
  ]
  ```
- **Hobby, or free generally** — leave `crons` out and point an external scheduler at the two
  URLs. Anything that can send a header works; [cron-job.org](https://cron-job.org) is free
  and does one-minute intervals. Send `Authorization: Bearer $CRON_SECRET`.
- **Don't run the notifier serverless at all** — put it on the same Fly machine as the
  checker with `NOTIFIER_POLL=on` and it paces itself, no scheduler needed. Simplest option,
  and the reason the container path is still supported.

The API's retention cron *is* Hobby-compatible: once a day is exactly right for it, so
`apps/api/vercel.json` ships that one.

---

## Vercel

Four projects, one per app, all pointing at the same repository.

For each: **Root Directory** = the app's folder (`apps/web`, `apps/status-page`, `apps/api`,
`apps/notifier`), and leave "Include source files outside of the Root Directory" enabled —
the apps import workspace packages from `packages/`.

Every `vercel.json` pins `"regions": ["iad1"]`. Put your Neon project in the matching region
(`us-east-1` for `iad1`). Every query is a round trip; a function in `fra1` talking to a
database in `us-east-1` pays ~90ms on each one, and the status page makes several per render.

The two Hono apps have no framework preset. They work through the `api/index.ts` entrypoint
plus the rewrite in their `vercel.json`, which sends every path to that one function and lets
Hono route internally.

### Environment variables

Shared by every project that talks to the database:

```
DATABASE_URL     Neon POOLED connection string — the host with "-pooler" in it.
                 The unpooled endpoint gives each invocation its own connection
                 and you will hit Neon's ceiling.
CLICKHOUSE_URL   Your ClickHouse HTTP endpoint. Needed by `web` and `api`; the
                 notifier and status-page don't read probe results.
```

Leave `NEON_WS_PROXY` **unset**. It exists for local development, where a plain Postgres
container can't terminate the WebSocket the Neon driver speaks.

| Project | Also needs |
|---|---|
| `web` | `AUTH_SECRET`, `AUTH_URL`, `API_URL`, `PROBE_API_KEY`, `OPERATOR_EMAILS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL`, `CLICKHOUSE_URL` |
| `status-page` | `API_URL` (server-side calls), `NEXT_PUBLIC_API_URL` (browser). Optional branding: `NEXT_PUBLIC_STATUS_TITLE`, `NEXT_PUBLIC_STATUS_DESCRIPTION`, `NEXT_PUBLIC_DEFAULT_PAGE`, `NEXT_PUBLIC_DEFAULT_WORKSPACE` |
| `api` | `PROBE_API_KEY`, `PAGE_UNLOCK_SECRET`, `CRON_SECRET`, `RETENTION_ENABLED=off`, `SLACK_SIGNING_SECRET`, `CLICKHOUSE_URL` |
| `notifier` | `CRON_SECRET`, `NOTIFIER_POLL=off` |

Two of those are easy to miss and fail quietly rather than loudly:

- **`RETENTION_ENABLED=off` on the API.** The in-process daily timer can't fire in a function
  that's frozen after responding. Left on, it does nothing and looks like it works.
- **`NOTIFIER_POLL=off` on the notifier.** Same reason — the loop would be killed mid-batch or
  hold the invocation open.

`OPERATOR_EMAILS` is a comma-separated allowlist of who may manage shared probe locations.
Unset means nobody, and the shared fleet is read-only. Workspace `admin` is *not* enough:
that role comes from `workspace_members`, so anyone who creates a workspace is an admin of
one.

Set `CRON_SECRET` on the Vercel project and Vercel sends it as
`Authorization: Bearer <value>` when it invokes a cron path. Use the same value on the api
and notifier projects so one external scheduler can drive both.

### Migrations

Vercel doesn't run them. Apply from your machine or CI before deploying:

```bash
DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" bun run db:migrate
```

Write migrations by hand — **do not run `db:generate`**. See `packages/db/CLAUDE.md`.

ClickHouse has its own one-liner, safe to re-run:

```bash
CLICKHOUSE_URL="https://…" bun run --filter @openmonitor/clickhouse migrate
```

---

## Fly.io — the checker

One app per region. Each probe location has its own token and the server derives the region
from it, so a single app scaled across regions would attribute every result to one location.

1. Create the location in the dashboard: **Settings → Probe locations**. Tick "Shared across
   all workspaces" if every tenant should be able to select it. The token is shown once.
2. Copy the template and edit `app` and `primary_region`:

```bash
cp deploy/fly/checker.fly.toml deploy/fly/checker-fra.toml
fly launch --no-deploy --copy-config --config deploy/fly/checker-fra.toml
fly secrets set PROBE_TOKEN=omp_… --config deploy/fly/checker-fra.toml
fly deploy --config deploy/fly/checker-fra.toml
```

A `shared-cpu-1x` / 256MB machine is enough — the checker is almost entirely idle between
probes. The template pins it up rather than autostopping: with no inbound traffic Fly has
nothing to wake it on, and a stopped checker is a region that silently reports nothing.

The notifier can share one of these machines with `NOTIFIER_POLL=on`, which removes the need
for any scheduler at all.

### Verifying a new region

`Settings → Probe locations` shows **Last seen** per location; it should tick over within one
check interval. If it stays empty, the checker's logs will show `401 unauthorized` — that
means the token doesn't match a location, which is almost always a copy/paste truncation.

---

## Status page URLs

Four shapes, resolved in this order:

| URL | Resolution |
|---|---|
| `status.acme.com` | Exact match on the page's `custom_domain`. A customer's own domain always wins. |
| `acme.openmonitor.app` | Workspace `acme`, page `default`. Needs `STATUS_PAGE_ROOT_DOMAIN`. |
| `acme.openmonitor.app/reports` | Workspace from the host, page from the path. |
| `openmonitor.app/acme/reports` | Path only — works with no wildcard DNS. |

A subdomain **pins** the workspace: it overrides a `?workspace=` parameter rather
than deferring to it, so `acme.openmonitor.app` can't be made to render another
tenant's page. `www` and the apex fall through to path routing, and labels
nested deeper than one level are rejected — a wildcard certificate only covers
one level, so anything deeper couldn't have reached you over TLS anyway.

Set `STATUS_PAGE_ROOT_DOMAIN` on the **api** project. Unset disables subdomain
resolution entirely, which is what a single-tenant self-host wants.

You need wildcard DNS (`*.openmonitor.app`) and a wildcard certificate. On
Vercel, **wildcard domains are a Pro feature** — on Hobby, put Cloudflare in
front with a proxied wildcard record, or serve the status page from Cloudflare
Pages.

Workspace and page slugs are checked against a reserved list
(`packages/db/src/reserved-slugs.ts`) so nobody can register `app`, `api` or
`mail` and own that hostname on your domain. Extend it before you launch if you
plan to use other labels.

## ClickHouse

Probe results go here rather than Postgres. Measured on real data a row costs ~2 bytes
against ~326 in Postgres, which is the difference between months of multi-region history
fitting in a free-tier database and not. Retention is a TTL on the table, so there's nothing
to schedule.

Sizing is undemanding: it is one append-only table, written once per probe and read in
aggregate. At four monitors across five regions that's ~250 KB/day. A 1 GB VM is plenty, and
the dataset stays in tens of megabytes for years.

Options, cheapest first:

- **Self-host on a free VM.** Oracle Cloud's always-free tier (4 ARM cores, 24 GB, no expiry)
  runs ClickHouse comfortably and can host the checker and notifier alongside it. Genuinely
  $0, at the cost of running a machine.
- **Self-host on a small paid VM** — Hetzner, Fly, a $5 droplet. Same picture, less
  babysitting.
- **Tinybird** has a free-forever 10 GB tier and is ClickHouse underneath; it's what
  openstatus uses. Its API is datasources-and-pipes rather than SQL over HTTP, so
  `@openmonitor/clickhouse` would need a second implementation — and you couldn't run it
  locally, which is the tradeoff this repo has deliberately avoided elsewhere.
- **ClickHouse Cloud** has no permanent free tier — a 30-day trial, then paid.

Whatever you pick, set `CLICKHOUSE_URL` and lock the endpoint down. It has no auth by
default, and the compose setup leaves it that way because it isn't exposed. A public one
must at minimum have a password and be reachable only from your app tier.

## Self-hosting everything

`docker compose up --build` runs the whole stack, migrations included. See
[CONTRIBUTING.md](CONTRIBUTING.md) for ports and the seed step.

For a real deployment on one box, the changes from the development compose file are:

- Replace every default secret. `PROBE_API_KEY`, `AUTH_SECRET`, `PAGE_UNLOCK_SECRET`,
  `CRON_SECRET` and the seeded probe tokens all ship with obvious placeholders.
- Change the seeded admin password, or don't run the seed profile at all.
- Set `OPERATOR_EMAILS` to your own address.
- Put a TLS terminator in front of `web` and `status-page`.

Keep `NOTIFIER_POLL=on` and `RETENTION_ENABLED=on` here — containers stay resident, so they
schedule themselves and you need no cron at all.

---

## Costs

Roughly, for a small deployment:

| | |
|---|---|
| Vercel Hobby | $0 (see the cron caveat above) |
| Neon free | $0 — 0.5 GB, autosuspends when idle |
| Fly, one checker | ~$2/month per region |
| ClickHouse on Oracle always-free | $0 |
| Cloudflare DNS | $0 |

Postgres now holds only relational data — monitors, incidents, users, the outbox — which
doesn't grow with probe volume, so Neon's 0.5 GB is no longer the binding constraint. What
grows is probe results, and those are in ClickHouse at ~2 bytes a row.

The practical floor for a fully free deployment is: Vercel Hobby for the two Next apps,
Neon free for Postgres, and one Oracle always-free VM running ClickHouse, the checker and the
notifier. That last machine also solves the cron problem from the top of this document — with
`NOTIFIER_POLL=on` the notifier paces itself and needs no external scheduler.
