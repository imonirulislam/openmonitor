# OpenMonitor

Open-source status page and incident management for HTTP, TCP, and DNS endpoints.
Inspired by [openstatusHQ/openstatus](https://github.com/openstatusHQ/openstatus).

## Architecture

```
apps/
  web          Next.js 15 — admin dashboard (auth-protected)
  status-page  Next.js 15 — public status page (cacheable)
  api          Hono — public read API, probe ingestion, slack receiver
  notifier     Hono worker — consumes events outbox, dispatches Slack
  checker      Go — HTTP probe worker

packages/
  db             Drizzle schema + migrations + typed client (Postgres)
  clickhouse     Probe results + the queries over them (ClickHouse)
  auth           Auth.js v5 config (Credentials now, OIDC-ready)
  notifications  Slack Block Kit templates + retry logic
  api-client     Typed Hono RPC client for web + status-page
  ui             Shared shadcn-style components
  tsconfig       Shared tsconfig presets
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2 (package manager and script runner)
- Node.js >= 22 (production runtime for the Next.js and Hono apps — the Neon
  driver needs a global WebSocket, which Node 22 provides)
- Go >= 1.22 (for `apps/checker`)
- Docker + Docker Compose (for local Postgres / full stack)

## Quickstart (everything in Docker)

```bash
docker compose up --build                  # migrations run automatically
docker compose --profile seed up seed      # optional demo data + admin user
```

To exercise multi-region probing locally, start four extra checkers alongside the
default one. The seed creates a shared probe location per region, and each checker
authenticates with that region's token:

```bash
docker compose --profile multi-region up -d --build   # local + eu-west, us-east, ap-south, sa-east
```

They all probe from the same host, so latencies are similar — it's the per-region
bookkeeping and status reduction being exercised, not real geography.

Then open http://localhost:5001 (admin) or http://localhost:5003 (public status page).
Seeded login: `admin@openmonitor.local` / `changeme`.

## Local development

```bash
# 1. Install
bun install

# 2. Copy env
cp .env.example .env

# 3. Start the datastores
docker compose up -d postgres clickhouse

# 4. Apply migrations and seed
bun run db:migrate
bun run --filter @openmonitor/clickhouse migrate
bun run db:seed

# 5. Run all apps in parallel
bun run dev
```

Service ports:

| Service     | Port                           |
|-------------|--------------------------------|
| web (admin) | 5001                           |
| api         | 5002                           |
| status-page | 5003                           |
| notifier    | 5004                           |
| postgres    | 5433 (host) → 5432 (container) |
| wsproxy     | 5434 (host) → 80 (container)   |
| clickhouse  | 5435 (host) → 8123 (container) |
| ch-ui       | 5436 (host) → 3488 (container) |

Postgres is published on host port **5433** so it doesn't collide with a Postgres you
may already run locally on 5432. Inside the Compose network the services still talk to
`postgres:5432`.

`wsproxy` is Neon's WebSocket-to-TCP shim. The app talks to Postgres with
`@neondatabase/serverless`, which only speaks the Postgres protocol over a WebSocket;
the proxy unwraps it locally so development runs the same driver as production.

Probe results live in ClickHouse rather than Postgres — a row costs ~2 bytes there against
~326, which is what lets months of history across several regions fit in a free-tier
database. To browse it: `docker compose --profile tools up -d ch-ui`, then
http://localhost:5436 and add a connection to `http://clickhouse:8123`.

Default seeded admin: `admin@openmonitor.local` / `changeme`.

## Common scripts

```bash
bun run dev          # all apps, hot reload
bun run build        # production build
bun run lint         # biome + oxlint
bun run format       # biome format + oxfmt
bun run typecheck
bun run knip         # find unused exports/files/deps
bun run db:migrate
bun run db:seed
bun run db:studio    # drizzle-kit studio
bun run gen          # turbo gen — scaffold monitors / packages / apps
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). Every service runs either as a container or on Vercel,
except `apps/checker` — TCP and DNS monitors need raw sockets and a chosen egress region, so
it stays a container (Fly.io, or anywhere else that runs one).

A typical low-cost setup is the two Next apps on Vercel, Postgres on Neon, ClickHouse on a
small VM, and one machine per probe region.

Per-app Dockerfiles live in `deploy/docker/`, a Fly template in `deploy/fly/`, and skeleton
Kubernetes manifests in `deploy/k8s/` with TODO markers for your registry, ingress hosts and
secrets — see `deploy/k8s/README.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the conventions that matter, and what a
good PR looks like. For security issues, see [SECURITY.md](SECURITY.md) — please don't
open a public issue.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, the license
requires you to publish your changes.

## For AI agents

Read `CLAUDE.md` at the repo root before making changes. Each app and package also has its own
`CLAUDE.md` with the contracts and conventions for that area. Repeatable tasks have skills
defined under `.claude/skills/` — use them so changes stay consistent across sessions.
