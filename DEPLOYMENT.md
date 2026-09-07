# Deploying OpenMonitor

| | Container | Serverless |
|---|---|---|
| `marketing`, `web`, `status-page` | docker compose | Vercel |
| `api` | docker compose / VM | Vercel |
| `notifier` | docker compose / VM | Vercel + an external scheduler |
| `checker` | VM, Fly, anything | **no** — needs raw sockets and a chosen egress region |
| Postgres | docker compose | Neon |
| ClickHouse | docker compose | a small VM, or Tinybird |

## Vercel

One project per app. Link from the app directory — `vercel link` treats the current directory
as the project root, which sets Root Directory for you:

```bash
cd apps/marketing && bunx vercel link   # then status-page, web, api
cat apps/marketing/.vercel/project.json # org + project ids, for CI secrets
```

Creating projects in the dashboard instead? Set **Root Directory** to the app folder and keep
"Include source files outside of the Root Directory" on — the apps import from `packages/`.

Every `vercel.json` pins `iad1`. Put Neon in `us-east-1` to match; the status page makes
several queries per render and each one is a round trip.

The two Hono apps have no framework preset. They run through `api/index.ts` plus a rewrite
that sends every path to that one function.

### Environment

| Project | Variables |
|---|---|
| all with data | `DATABASE_URL` (Neon **pooled** — the `-pooler` host), `CLICKHOUSE_URL` |
| `marketing` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL`, `NEXT_PUBLIC_REPO_URL` |
| `status-page` | `API_URL`, `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_STATUS_*` branding |
| `web` | `AUTH_SECRET`, `AUTH_URL`, `API_URL`, `PROBE_API_KEY`, `OPERATOR_EMAILS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL` |
| `api` | `PROBE_API_KEY`, `PAGE_UNLOCK_SECRET`, `CRON_SECRET`, `SLACK_SIGNING_SECRET`, `STATUS_PAGE_ROOT_DOMAIN`, **`RETENTION_ENABLED=off`** |
| `notifier` | `CRON_SECRET`, **`NOTIFIER_POLL=off`** |

Leave `NEON_WS_PROXY` unset — local dev only.

`RETENTION_ENABLED=off` and `NOTIFIER_POLL=off` fail silently if forgotten: both start a timer
or loop a frozen function can never run, so they do nothing and look fine.

`OPERATOR_EMAILS` is who may manage shared probe locations; unset means nobody. Workspace
`admin` isn't enough — that role comes from `workspace_members`, so anyone who creates a
workspace has it.

### Migrations

Vercel doesn't run them. Before deploying:

```bash
DATABASE_URL="postgresql://…-pooler…?sslmode=require" bun run db:migrate
CLICKHOUSE_URL="https://…" bun run --filter @openmonitor/clickhouse migrate
```

Write Postgres migrations by hand — **never run `db:generate`**. See `packages/db/CLAUDE.md`.

### CI/CD

`.github/workflows/deploy.yml` deploys on push to `main`: migrate → `api` → `web`, with
`marketing` and `status-page` in parallel. It exists rather than Vercel's Git integration
because Vercel won't migrate, and `web`/`api` must not serve against an older schema.

> Turn off Vercel's automatic Git deploys or every push deploys twice, with no ordering and no
> migration. Project Settings → Git → disconnect, or set the Ignored Build Step to `exit 0`.

Only affected apps deploy; each filter covers its dependency closure, so `packages/ui` hits
three apps and `bun.lock` hits everything.

Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_{MARKETING,STATUS_PAGE,WEB,API}`,
`DATABASE_URL`, `CLICKHOUSE_URL`. The runner needs to reach both databases — if ClickHouse is
on a private VM, migrate from somewhere that can.

## Status page URLs

Resolved in this order:

| URL | Resolves to |
|---|---|
| `status.acme.com` | the page's `custom_domain` — a customer's own domain always wins |
| `acme.openmonitor.app` | workspace `acme`, page `default` (needs `STATUS_PAGE_ROOT_DOMAIN`) |
| `acme.openmonitor.app/reports` | workspace from host, page from path |
| `openmonitor.app/acme/reports` | path only — no wildcard DNS needed |

A subdomain pins the workspace: it overrides `?workspace=`, and a page missing from that
workspace 404s rather than falling through, so one tenant's host can't render another's page.
`www` and the apex fall through to path routing; deeper labels are rejected.

Needs wildcard DNS and a wildcard certificate. **Wildcard domains are Vercel Pro** — on Hobby,
front it with Cloudflare or serve the status page from Cloudflare Pages.

Slugs are checked against `packages/db/src/reserved-slugs.ts` so nobody can register `app`,
`api` or `mail` and own that hostname.

## ClickHouse

Probe results only; everything relational stays in Postgres. A row costs ~2 bytes against ~326
in Postgres, which is what makes months of multi-region history fit a free tier. Retention is a
TTL on the table — nothing to schedule.

One append-only table, ~250 KB/day at four monitors across five regions. A 1 GB VM is plenty.

- **Oracle always-free Ampere** (2 OCPU / 12 GB): free forever, but **home region only** —
  chosen at signup, unchangeable — and Oracle reclaims instances under ~20% CPU (95th
  percentile over 7 days). A box running only a checker is that idle, so co-locate ClickHouse
  and the notifier or it will vanish.
- **GCE always-free e2-micro** (us-west1/central1/east1): no idle policy, one US region.
- **Any small paid VM** — Hetzner CX22 (~$4.59/mo, Ashburn) is the obvious one: real VM,
  `deploy/vm/docker-compose.yml` runs unchanged, no idle policy.
- **Tinybird** free tier is 10 GB and is ClickHouse underneath, but its API is
  datasources-and-pipes, so `@openmonitor/clickhouse` would need a second implementation and
  couldn't run locally.
- **ClickHouse Cloud** has no permanent free tier.

No auth by default. Local compose leaves it that way because it isn't exposed; anything
reachable needs a password and an allowlist.

## Notifier scheduling

Vercel Cron on Hobby is 2 jobs, once a day, 10s timeout — a daily outbox drain means 24-hour
alert latency, so `apps/notifier/vercel.json` ships **no `crons` block**. Pick one:

- **Vercel Pro** — add it yourself:
  ```json
  "crons": [
    { "path": "/cron/drain", "schedule": "* * * * *" },
    { "path": "/cron/sweep", "schedule": "*/5 * * * *" }
  ]
  ```
- **Cloudflare Workers cron** — free, down to one minute, ~1,500 of 100,000 daily requests:
  ```js
  export default {
    async scheduled(event, env) {
      const path = event.cron === "*/5 * * * *" ? "/cron/sweep" : "/cron/drain";
      await fetch(`${env.NOTIFIER_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
    },
  };
  ```
- **Don't run it serverless** — same VM as the checker with `NOTIFIER_POLL=on`. It paces
  itself; no scheduler at all.

The API's retention cron *is* daily work, so `apps/api/vercel.json` ships that one.

## Checker

One app per region: the location token determines which region results are attributed to, so a
single app scaled across regions reports everything as one location.

1. **Settings → Probe locations** → create it. Tick "Shared across all workspaces" if every
   tenant should be able to select it. The token shows once.
2. Copy the Fly template, edit `app` and `primary_region`:

```bash
cp deploy/fly/checker.fly.toml deploy/fly/checker-fra.toml
fly launch --no-deploy --copy-config --config deploy/fly/checker-fra.toml
fly secrets set PROBE_TOKEN=omp_… --config deploy/fly/checker-fra.toml
fly deploy --config deploy/fly/checker-fra.toml
```

`shared-cpu-1x` / 256MB is enough. The template pins the machine up rather than autostopping —
with no inbound traffic Fly has nothing to wake it on, and a stopped checker is a region that
silently reports nothing.

**Don't run a checker on an oversubscribed VPS** — Contabo and similar. CPU steal is recorded
as the monitored service being slow, so you get phantom `degraded` results and auto-incidents
for outages that never happened. A prober is one of the few workloads where a noisy neighbour
corrupts the output rather than just slowing it down. Predictable CPU matters more than core
count; Fly's smallest machine is fine.

**There is no free multi-region checker.** Free tiers give one instance in one region; extra
regions are ~$2/month each on Fly, which is what openstatus pays. Starting with one is fine —
`regionPolicy` defaults to `any`, so adding regions later doesn't change existing monitors.

To verify a region, watch **Last seen** on the probe locations page; it should tick within one
check interval. `401 unauthorized` in the checker log means the token doesn't match a location,
almost always a truncated paste.

## The one VM

ClickHouse, the notifier and one checker on a single box. `deploy/vm/docker-compose.yml`
runs exactly those three against Neon:

```bash
git clone https://github.com/imonirulislam/openmonitor && cd openmonitor
cp deploy/vm/.env.example deploy/vm/.env    # fill in Neon URL, ClickHouse password, probe token
docker compose -f deploy/vm/docker-compose.yml --env-file deploy/vm/.env up -d --build
```

Put it in the region nearest your Neon project and Vercel functions — Ashburn for
`us-east-1`/`iad1` — since the api writes every probe result to ClickHouse.

Any VM works: Oracle always-free, Hetzner CX22, a droplet. **Fly and Railway are container
platforms, not VMs** — compose doesn't transfer, you'd split this into a service each plus a
volume for ClickHouse. Fly is still the right home for *extra checker regions*, where it's one
container, no volume, and `deploy/fly/checker.fly.toml` already exists.

Then set `CLICKHOUSE_URL`, `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` on the `web` and `api`
Vercel projects, pointing at this box on 8123.

Port 8123 has to be reachable from Vercel, so firewall it to Vercel's egress plus your own
address. The password is the floor, not the whole answer.

## Self-hosting everything

`docker compose up --build` runs the lot, migrations included. Ports and the seed step are in
[CONTRIBUTING.md](CONTRIBUTING.md).

For a real deployment on one box:

- Replace every default secret: `PROBE_API_KEY`, `AUTH_SECRET`, `PAGE_UNLOCK_SECRET`,
  `CRON_SECRET`, and the seeded probe tokens.
- Change the seeded admin password, or skip the seed profile.
- Set `OPERATOR_EMAILS`.
- Put TLS in front of `web`, `status-page` and `marketing`.
- Keep `NOTIFIER_POLL=on` and `RETENTION_ENABLED=on` — containers stay resident and schedule
  themselves.

## Cost

| | |
|---|---|
| Vercel Hobby | $0 (see the cron caveat) |
| Neon free | $0 — 0.5 GB, autosuspends |
| ClickHouse on a free VM | $0 |
| Fly, per extra checker region | ~$2/month |
| Cloudflare DNS | $0 |

Postgres no longer grows with probe volume, so Neon's 0.5 GB isn't the binding constraint —
probe results are in ClickHouse at ~2 bytes a row.

Fully free: Vercel Hobby for the four apps, Neon for Postgres, one always-free VM running
ClickHouse, the notifier (`NOTIFIER_POLL=on`) and one checker. That VM removes the scheduler
problem, and ClickHouse keeps it busy enough to survive Oracle's idle reclamation.
