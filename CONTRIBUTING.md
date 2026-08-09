# Contributing to OpenMonitor

Thanks for taking the time. This guide covers getting the stack running, the conventions
that keep the codebase coherent, and what a good PR looks like.

## Prerequisites

- [Bun](https://bun.sh) >= 1.2 — package manager and script runner
- Node.js >= 20.11 — production runtime for the Next.js and Hono apps
- Go >= 1.25 — for `apps/checker`
- Docker + Docker Compose — for Postgres, or the whole stack

## Getting started

The fastest path — everything in Docker, migrations included:

```bash
docker compose up --build
docker compose --profile seed up seed    # demo monitors + admin user
```

| Service | URL |
|---|---|
| Admin | http://localhost:5001 |
| API | http://localhost:5002 |
| Public status page | http://localhost:5003 |
| Postgres | localhost:5433 |

Seeded login: `admin@openmonitor.local` / `changeme`.

For day-to-day development you probably want hot reload instead:

```bash
bun install
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run db:seed
bun run dev
```

`apps/checker` is a Go binary and does **not** start with `bun run dev`. Run it separately
with `go run .` from `apps/checker`.

## Repository layout

```
apps/
  web          Next.js — admin dashboard. All admin writes live here.
  status-page  Next.js — public status page. Read-only, calls apps/api only.
  api          Hono — public reads, probe ingestion, Slack receiver
  notifier     Worker — drains the events outbox, sends Slack, retries
  checker      Go — runs HTTP/TCP/DNS probes, posts results back

packages/
  db             Drizzle schema, migrations, typed client
  auth           Auth.js v5 config
  notifications  Slack Block Kit templates (pure functions)
  api-client     Typed client used by status-page
  ui             Shared components
  tsconfig       Shared tsconfig presets
```

`CLAUDE.md` at the repo root is the authoritative description of how the pieces fit
together, and each app and package has its own. **Read the relevant one before editing
inside that area** — it will save you a round of review.

## The rules that matter most

These are the ones where a well-meaning change causes real damage:

1. **Writes that fire notifications must go through the outbox.** If a state change should
   produce a Slack message, insert into `events` in the *same transaction*. Never call
   Slack from a write path. This is what prevents lost notifications when Slack is down
   and duplicates when an HTTP write is retried.
2. **Admin writes belong in `apps/web` server actions**, not `apps/api`. `apps/api` is
   public reads plus bearer-authenticated probe ingestion.
3. **`apps/status-page` must not import `@openmonitor/db`.** It calls `apps/api`. This
   keeps the public surface independently deployable.
4. **All tables live in `packages/db/src/schema.ts`.** No ad-hoc tables in app code.
5. **Validate at the boundary with Zod, then trust the inside.** Don't scatter defensive
   checks through internal code.
6. **`@openmonitor/db`, `@openmonitor/auth`, and `@openmonitor/notifications` are
   server-only.** Don't import them into client components.

## How a feature lands

1. **Schema** — edit `packages/db/src/schema.ts`, run `bun run db:generate`, review the
   generated SQL before committing it.
2. **Domain logic** — a server action in `apps/web/src/lib/actions/<feature>.ts`. Validate
   with Zod, wrap multi-row writes in a transaction, emit outbox events if needed.
3. **Admin UI** — a page under `apps/web/src/app/dashboard/<feature>/`.
4. **Public surface** — add the field to `/v1/status` in `apps/api/src/routes/status.ts`,
   mirror the type in `@openmonitor/api-client`, render it in `apps/status-page`.
5. **Notifications** — add the event type to `eventTypeEnum` and a render case in
   `@openmonitor/notifications`.

Repeatable tasks have prepared guides under `.claude/skills/` — adding a monitor, a
notification channel, an SSO provider, a new app or package. Following them keeps changes
consistent without rederiving the conventions.

## Migrations

- Migrations are checked in under `packages/db/drizzle/` and must be reviewed by hand.
- **Never edit a migration that has shipped.** Add a new one.
- `migrate.ts` installs the `notify_monitor_changed()` trigger function *before* running
  migrations, because `0013` and `0014` attach triggers that reference it. Keep that
  ordering if you touch the migration runner.

## Before you open a PR

```bash
bun run typecheck                        # must pass
bun run lint                             # must pass
bun run format                           # apply formatting
cd apps/checker && go build ./... && go vet ./...
```

Two things to know about lint:

- `bun run lint` runs biome, oxlint, and tsgolint. It must exit 0.
- Some rules are deliberately set to **warn**, not error — non-null assertions, plus a
  batch of pre-existing accessibility and `useExhaustiveDependencies` findings. Warnings
  are visible tech debt, not permission to add more. If you can fix one you touched,
  please do.

Avoid `biome check --write --unsafe`. Its optional-chaining rewrite turns load-bearing
`!` assertions into `?.` and breaks typechecking.

## Pull requests

- Keep them focused. One concern per PR reviews far faster.
- Explain **why**, not just what. The diff shows what changed.
- Say how you verified it. "Typecheck and lint pass" is fine for a refactor; a behavior
  change deserves a note about what you actually exercised.
- If you changed the schema, say whether the migration is safe to run against a database
  with existing rows.
- Draft PRs are welcome for early feedback.

## Reporting bugs and requesting features

Use the issue templates. For anything security-related, **do not open a public issue** —
see [SECURITY.md](SECURITY.md).

Features on the "deliberately not built yet" list in `CLAUDE.md` — multi-region probes,
email/SMS notifications, public API tokens, on-call schedules — want a design discussion
before a PR. Open an issue first so the approach can be agreed on.

## License

OpenMonitor is licensed under **AGPL-3.0**. By contributing, you agree that your
contributions are licensed under the same terms. Note that AGPL's network clause means
anyone running a modified version as a service must publish their changes.
