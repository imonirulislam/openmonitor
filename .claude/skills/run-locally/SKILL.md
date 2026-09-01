---
name: run-locally
description: Get the whole stack running on the user's machine. Use when the user says "how do I run this," "set up dev," or asks about local development.
---

# Run the stack locally

## First time

```bash
# 1. Install all workspace deps
bun install

# 2. Copy env
cp .env.example .env
# Edit .env if needed — defaults work for the local docker-compose datastores.

# 3. Start the datastores
docker compose up -d postgres clickhouse

# 4. Run migrations — Postgres schema, then the ClickHouse table
bun run db:migrate
bun run --filter @openmonitor/clickhouse migrate

# 5. Seed admin user + example monitors
bun run db:seed
# Output prints the admin credentials. Default: admin@openmonitor.local / changeme.

# 6. Start everything in parallel
bun run dev
```

| Service     | URL                       |
|-------------|---------------------------|
| Admin       | http://localhost:5001     |
| API         | http://localhost:5002     |
| Status page | http://localhost:5003     |
| Postgres    | localhost:5433            |

The Go checker (`apps/checker`) does NOT start with `bun run dev` — it's a Go binary, not a
node app. Run it separately:

```bash
cd apps/checker
go run .
```

It will fail until the API is up and `PROBE_API_KEY` matches. The default `.env` sets it
to `change-me-probe-key`; keep it consistent.

## Sanity checks

- Visit http://localhost:5001/login and sign in with the seeded admin.
- Visit http://localhost:5003 — should show 4 monitors with "Unknown" status until the
  checker runs.
- Once the checker runs, statuses update within `intervalSeconds`.

## Common issues

- **`AUTH_SECRET` errors on web** — generate one with `openssl rand -base64 32`, paste into
  `.env`.
- **DB connection refused** — `docker compose ps` to confirm Postgres is up; `docker
  compose logs postgres` to see why if not.
- **Checker can't reach api** — make sure `bun run dev` started the API (port 5002). The
  checker uses `API_URL` from env.
- **Slack messages not firing** — there's no notification channel seeded by default. Add
  one in /dashboard/channels and link it to a monitor.

## Full stack via Docker

```bash
docker compose up --build                  # everything, migrations included
docker compose --profile seed up seed      # optional: demo monitors + admin user
docker compose --profile multi-region up -d --build   # 4 extra regional checkers
```

The `multi-region` profile adds checkers for eu-west, us-east, ap-south and sa-east
next to the default `local` one. The seed creates a shared probe location for each,
with token `omp_dev_<region>_change_me`. Useful for exercising the per-region status
reduction and the Regions panel; all five probe from the same host so latency is not
representative.

This builds and runs all five apps + Postgres. A one-shot `migrate` service applies
migrations before any schema-reading service starts, so this works on an empty volume
with no manual step. Seeding is behind a profile so a real deployment never gets the
known-password admin user.

Slower iteration than `bun run dev` for TS apps, but useful for verifying the
production build path.

## Tearing down

```bash
docker compose down                         # stop, keep data
docker compose --profile seed down -v       # stop and wipe Postgres volume
```

Include `--profile seed` when wiping. A plain `down` skips profile-gated services, leaving
the `seed` container behind still attached to the network that just got deleted — the next
`docker compose --profile seed up seed` then fails with `network ... not found`.
