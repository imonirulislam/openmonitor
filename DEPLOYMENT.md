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

One project per app, each with **Root Directory** set to its app folder — the layout in
[Vercel's Turborepo guide](https://vercel.com/docs/monorepos/turborepo).

```bash
for a in marketing status-page api web; do
  (cd "apps/$a" && bunx vercel link --yes --project "openmonitor-$a")
done
cat apps/marketing/.vercel/project.json   # org + project ids, for the CI secrets
```

`vercel link` does **not** set Root Directory. Linking from the app directory creates
`.vercel/` there and leaves Root Directory at `.`. Set it per project, under
Settings → Build & Deployment, and keep "Include source files outside of the Root Directory"
on — the apps import from `packages/`:

```bash
vercel project inspect "$(python3 -c 'import json;print(json.load(open("apps/web/.vercel/project.json"))["projectId"])')"
# Root Directory   apps/web
```

Left at `.`, the deploy fails at the upload rather than the build: `apps/<app>` becomes the
upload base while Next traces server files into the workspace `node_modules` above it, and
`deploy --prebuilt` reports `File does not exist: node_modules/@swc/helpers/…`. The workflow
runs every vercel command from the repo root for the same reason.

Names are cosmetic — CI authenticates with `VERCEL_PROJECT_ID`, so renaming a project later
changes nothing but its default `*.vercel.app` URL. Don't connect these projects to Git;
`.github/workflows/deploy.yml` deploys them, and both would fire on every push.

Every `vercel.json` pins `sin1`, matching Neon in `ap-southeast-1` and the VM in Singapore.
Keep all three together — the status page makes several queries per render and each one is a
round trip. Moving deployment means changing the five `vercel.json` files, the Neon project
(its region is fixed at creation) and the VM, together.

The two Hono apps have no framework preset. Each one's `build` bundles `src/vercel.ts` into
`api/index.js` — a single self-contained function, with a rewrite sending every path to it.

The bundle is not a packaging preference. `@vercel/node` typechecks a TypeScript entrypoint
with compiler options of its own, ignoring both the app tsconfig and the repo root, and
without `strict` Drizzle's insert/update types collapse to a partial column set — the deploy
failed on `TS2353` for columns that exist while CI passed. Shipping JS leaves it nothing to
typecheck, and bundling the dependencies in means nothing to file-trace either.

### Environment

These belong to the **Vercel project**, not GitHub. A GitHub secret only reaches steps that
map it into `env:` — `vercel build` reads what `vercel pull` fetched from the project, and
deployed functions read the project's env at runtime. Neither can see GitHub, so a value
that exists only as a GitHub secret produces `Error: DATABASE_URL must be set` at build.

```bash
export DATABASE_URL='postgresql://…-pooler…?sslmode=require'
export CLICKHOUSE_URL='https://clickhouse.openmonitor.app' ADMIN_EMAIL='you@example.com'
./deploy/vercel-env.sh            # print
./deploy/vercel-env.sh --apply    # set
```

GitHub needs only `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_*`, and — for the
`migrate` job alone — `DATABASE_URL` and `CLICKHOUSE_*`.

| Project | Variables |
|---|---|
| all with data | `DATABASE_URL` (Neon **pooled** — the `-pooler` host), `CLICKHOUSE_URL` |
| `marketing` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL`, `NEXT_PUBLIC_REPO_URL` |
| `status-page` | `API_URL`, `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_STATUS_*` branding |
| `web` | `AUTH_SECRET`, `AUTH_URL`, `API_URL`, `PROBE_API_KEY`, `OPERATOR_EMAILS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL`, optional `SIGNUPS_ENABLED=on` + `STATUS_PAGE_ROOT_DOMAIN` |
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

Then create the first admin. Signup is closed unless `SIGNUPS_ENABLED=on`, and `db:seed` is
demo data with published credentials:

```bash
DATABASE_URL="postgresql://…" ADMIN_EMAIL=you@example.com \
  bun run --filter @openmonitor/auth bootstrap
```

### CI/CD

`.github/workflows/deploy.yml` deploys on push to `main`: migrate → `api` → `web`, with
`marketing` and `status-page` in parallel. It exists rather than Vercel's Git integration
because Vercel won't migrate, and `web`/`api` must not serve against an older schema.

> Turn off Vercel's automatic Git deploys or every push deploys twice, with no ordering and no
> migration. Project Settings → Git → disconnect, or set the Ignored Build Step to `exit 0`.

Only affected apps deploy; each filter covers its dependency closure, so `packages/ui` hits
three apps and `bun.lock` hits everything.

Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_{MARKETING,STATUS_PAGE,WEB,API}`,
`DATABASE_URL`, `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`. The runner needs to reach both databases — if ClickHouse is
on a private VM, migrate from somewhere that can.

## Status page URLs

Resolved in this order:

| URL | Resolves to |
|---|---|
| `status.acme.com` | the page's `custom_domain` — a customer's own domain always wins |
| `acme.openmonitor.app` | the page slugged `acme` (needs `STATUS_PAGE_ROOT_DOMAIN`) |
| `openmonitor.app/acme` | path only — no wildcard DNS needed |

The subdomain **is** the page slug, not the workspace slug, so one workspace can publish
several independently-addressed pages. `status_pages.slug` is therefore unique across all
workspaces, not within one. Reserved labels and the apex fall through to path routing;
deeper labels are rejected.

Only the subdomain form needs wildcard DNS and a wildcard certificate — **wildcard domains are
Vercel Pro**, and Vercel issues the certificate over DNS-01, so the domain has to be on Vercel's
nameservers. A Cloudflare CNAME won't do it.

The path form works everywhere with no wildcard, so `status.example.com/acme` is the safe thing
to advertise until that's set up. The signup form previews the path URL for exactly that reason.

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

Put it in the same region as Neon and the Vercel functions — Singapore for
`ap-southeast-1`/`sin1` — since the api writes every probe result to ClickHouse. On Oracle
this is the tenancy's home region, chosen at signup and unchangeable, so it's the fixed point
everything else should be matched to.

Any VM works: Oracle always-free, Hetzner CX22, a droplet. **Fly and Railway are container
platforms, not VMs** — compose doesn't transfer, you'd split this into a service each plus a
volume for ClickHouse. Fly is still the right home for *extra checker regions*, where it's one
container, no volume, and `deploy/fly/checker.fly.toml` already exists.

ClickHouse is fronted by Caddy, which gets a Let's Encrypt certificate for
`CLICKHOUSE_HOSTNAME` on first start — point an A record at the box and open 80/443. Then set
`CLICKHOUSE_URL=https://<that hostname>` plus `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` on
the `web` and `api` Vercel projects.

TLS isn't optional here: Vercel has no stable egress IP on Hobby, so you can't allowlist, and
ClickHouse authenticates with HTTP Basic — over plain HTTP the password crosses the internet
in the clear on every query.

`ch-ui` is bound to loopback. Reach it with `ssh -L 5436:127.0.0.1:5436 user@your-vm`.

Sizing: 2 OCPU / 12 GB and the **default ~50 GB boot volume at Balanced performance**. The
whole footprint is under 20 GB — ClickHouse data stays in tens of megabytes for years, the
rest is Docker images and the OS. Don't take a bigger volume or higher VPU for the sake of it;
both bill, and on Oracle the "Always Free Eligible" badge is what tells you a config is
actually free, not the cost estimate.

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
