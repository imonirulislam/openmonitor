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
  auth           Auth.js v5 config (Credentials now, OIDC-ready)
  notifications  Slack Block Kit templates + retry logic
  api-client     Typed Hono RPC client for web + status-page
  ui             Shared shadcn-style components
  tsconfig       Shared tsconfig presets
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2 (package manager and script runner)
- Node.js >= 20.11 (production runtime for the Next.js and Hono apps)
- Go >= 1.22 (for `apps/checker`)
- Docker + Docker Compose (for local Postgres / full stack)

## Quickstart (everything in Docker)

```bash
docker compose up --build                  # migrations run automatically
docker compose --profile seed up seed      # optional demo data + admin user
```

Then open http://localhost:5001 (admin) or http://localhost:5003 (public status page).
Seeded login: `admin@openmonitor.local` / `changeme`.

## Local development

```bash
# 1. Install
bun install

# 2. Copy env
cp .env.example .env

# 3. Start Postgres
docker compose up -d postgres

# 4. Generate the initial migration from the schema, apply it, and seed
bun run db:generate
bun run db:migrate
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
| postgres    | 5433 (host) → 5432 (container) |

Postgres is published on host port **5433** so it doesn't collide with a Postgres you
may already run locally on 5432. Inside the Compose network the services still talk to
`postgres:5432`.

Default seeded admin: `admin@openmonitor.local` / `changeme`.

## Common scripts

```bash
bun run dev          # all apps, hot reload
bun run build        # production build
bun run lint         # biome + oxlint
bun run format       # biome format + oxfmt
bun run typecheck
bun run knip         # find unused exports/files/deps
bun run db:generate  # generate a new migration from schema changes
bun run db:migrate
bun run db:seed
bun run db:studio    # drizzle-kit studio
bun run gen          # turbo gen — scaffold monitors / packages / apps
```

## Deployment (EKS)

Per-app Dockerfiles in `deploy/docker/`. Images install dependencies with Bun and run the
apps on Node. Skeleton manifests in `deploy/k8s/` with TODO markers for your registry,
ingress hosts, and secrets. See `deploy/k8s/README.md`.

## For AI agents

Read `CLAUDE.md` at the repo root before making changes. Each app and package also has its own
`CLAUDE.md` with the contracts and conventions for that area. Repeatable tasks have skills
defined under `.claude/skills/` — use them so changes stay consistent across sessions.
