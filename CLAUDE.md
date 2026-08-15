# OpenMonitor — Engineering guide for AI agents

This file is the single source of truth for **how** this codebase fits together. If you are
asked to make changes, read this first. Per-app and per-package CLAUDE.md files cover
specifics for that area — read those too before editing inside one.

## What this is

Status page + incident management for HTTP, TCP, and DNS endpoints.
Inspired by openstatusHQ/openstatus but scoped down: single-region probes,
Slack-only notifications, Postgres single-tenant.

## Architecture map

```
┌─────────────────┐       ┌─────────────────┐
│  status-page    │◀──────│   apps/api      │
│  (public, Next) │ HTTP  │   (Hono)        │
└─────────────────┘       └────┬──────┬─────┘
                               │      │
       ┌───────────────────────┘      │ probe results /
       │ probe list                   │ list monitors (bearer)
       ▼                              ▼
┌─────────────┐                 ┌──────────────┐
│  checker    │                 │   Postgres   │
│  (Go)       │                 │              │
└─────────────┘                 └────┬─────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        ┌─────────────┐      ┌──────────────┐    ┌──────────────┐
        │  apps/web   │      │  notifier    │    │  events      │
        │  (admin)    │      │  (worker)    │    │  outbox      │
        └─────────────┘      └──────┬───────┘    └──────────────┘
                                    │ Slack webhook
                                    ▼
                              [ Slack channels ]
```

## The five apps

| App | Stack | What it owns |
|---|---|---|
| `apps/web` | Next.js 15 + Auth.js | Admin login, monitor/incident/maintenance/channel CRUD. **All admin writes happen here.** |
| `apps/status-page` | Next.js 15 | Public status page. Read-only. Calls `apps/api` only. |
| `apps/api` | Hono | Public read endpoints, probe ingestion (bearer-auth), Slack inbound webhook |
| `apps/notifier` | Hono worker | Drains `events` outbox, dispatches Slack messages, retries with backoff. Self-paced loop or cron-driven via `/cron/*` — see its CLAUDE.md |
| `apps/checker` | Go (stdlib) | Pulls monitor list from API, runs HTTP probes, posts results back |

## The six packages

| Package | Purpose |
|---|---|
| `@openmonitor/db` | Drizzle schema (Postgres). Single source of truth for tables, types, and the events outbox. |
| `@openmonitor/auth` | Auth.js v5 config. Credentials provider for v1; OIDC provider stubs commented in. |
| `@openmonitor/notifications` | Slack Block Kit templates + sender. Pure functions — no DB, no scheduling. |
| `@openmonitor/api-client` | Typed fetch client used by `status-page` (and any future external consumer). |
| `@openmonitor/ui` | Shared status badges, uptime bar, severity badge. Used by both Next.js apps. |
| `@openmonitor/tsconfig` | Three tsconfig presets: base, node, nextjs. |

## Cross-cutting rules

### 1. Writes that fire notifications must use the outbox

If an admin action or probe result should fire a Slack message, the producer **must** insert
a row into `events` in the same transaction as the state change. Never call Slack directly
from a write path. The notifier handles delivery, retry, and routing.

This rule prevents lost notifications when Slack is down and prevents duplicates if a write
gets retried at the HTTP layer.

### 2. Admin writes go through `apps/web`, not `apps/api`

`apps/api` exposes only public reads + probe ingestion. Don't add admin write endpoints
there unless we deliberately move auth into the API too. Until then, "the admin can do X"
means "there's a server action in `apps/web/src/lib/actions/`."

### 3. Status-page must not touch the database

`apps/status-page` calls `apps/api` for everything. This keeps the public surface
deployable independently and means a DB outage doesn't surface as a TypeScript import error.

### 4. Schema lives in one place

All tables are in `packages/db/src/schema.ts`. Don't define ad-hoc tables in app code.
Migrations land in `packages/db/drizzle/` and are checked in.

### 5. Validate at the boundary, trust the inside

User input (forms, API request bodies) is validated with Zod. Once it crosses the boundary
into a server action or route handler, treat it as trusted. Don't sprinkle defensive checks
through internal code.

### 6. Server-only modules

`@openmonitor/db`, `@openmonitor/auth`, and `@openmonitor/notifications` are server-only. Don't
import them into client components — Next.js will fail the build, but be deliberate about
the boundary.

## Roles

`admin` > `editor` > `viewer`. Server actions check `requireEditor()` (refuses viewer).
Add `requireAdmin()` only when there's an admin-only screen — don't pre-build the gate.

These are **per-workspace** roles, read from `workspace_members`. "admin" means admin of
one tenant, and anyone who creates a workspace is an admin of it.

Deployment-wide things therefore can't be gated on `admin`. Shared probe locations
(`workspaceId IS NULL`) are the operator's fleet, and mutating one is gated on
`isOperator()` in `apps/web/src/lib/operator.ts` — an allowlist in `OPERATOR_EMAILS`,
controlled by whoever controls the deploy. If you add another deployment-wide resource,
gate it the same way, not on a workspace role.

## How features land

1. **Schema** — add to `packages/db/src/schema.ts`, then hand-write the migration under
   `packages/db/drizzle/` and add a `_journal.json` entry. Do **not** run `db:generate` —
   the snapshot chain is stale and it emits destructive SQL. See `packages/db/CLAUDE.md`.
2. **Domain logic** — server actions in `apps/web/src/lib/actions/<feature>.ts`. Validate
   with Zod, wrap multi-row writes in a transaction, emit events if needed.
3. **Admin UI** — page under `apps/web/src/app/dashboard/<feature>/`.
4. **Public surface** — if it should appear on the public page, add a field to the
   `/v1/status` response in `apps/api/src/routes/status.ts`, mirror the type in
   `@openmonitor/api-client`, render it in `apps/status-page/src/app/page.tsx`.
5. **Notifications** — if a state transition should notify, add the event type to the
   `eventTypeEnum` and a render case in `@openmonitor/notifications`. Producers emit via the
   outbox.

## What we deliberately don't have (yet)

- Multi-region probe aggregation
- Email / SMS / PagerDuty notifications
- Public API tokens for read access
- Status page custom domains / multi-tenancy
- On-call schedules
- Subscriber email/SMS lists for status updates

If asked to add one of these, propose the design before scaffolding.

## .claude/skills/

Repeatable tasks have prepared prompts under `.claude/skills/<name>/SKILL.md`. Use them
when adding a monitor, a notification channel type, an SSO provider, a new app, or a new
package. Following the skill keeps changes consistent with the conventions above without
having to rederive them every session.
