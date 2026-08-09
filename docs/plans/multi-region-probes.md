# Multi-region probes: per-location auth + per-region status

Status: **proposed** — no code written yet. Per root `CLAUDE.md`, multi-region probe
aggregation is on the "propose the design before scaffolding" list.

## What already works

Region flows end to end today. This is not a greenfield feature:

| Layer | Where | State |
|---|---|---|
| Checker sends region | `apps/checker/api.go:52` — `Region string \`json:"region"\`` | ✅ |
| API accepts it | `apps/api/src/routes/probes.ts:20` — `region: z.string().min(1).max(50).default("local")` | ✅ |
| DB stores it | `monitor_runs.region varchar(50) not null default 'local'` | ✅ |
| Events carry it | `monitor.down` / `.degraded` / `.recovered` payloads include `region` | ✅ |
| Checker needs no DB access | `listener.go` logs "falling back to polling only" when `DATABASE_URL` is unset | ✅ |

That last row is the important one: **a remote checker needs only outbound HTTPS to
`apps/api` plus a token.** Postgres is never exposed. Deploying a checker to another
region is already an infrastructure task, not a code task.

Two things block actually turning it on.

## Problem 1 — the probe token can't distinguish or scope regions

`apps/api/src/middleware/api-key.ts` does a timing-safe compare against a single global
`PROBE_API_KEY` and nothing else. `region` is then read straight from the request body.

With one region that's fine. With N regions:

- Any checker holding the key can **claim to be any region** and write results attributed
  to `eu-west`. Region is self-declared and unverified.
- One leaked key compromises **every** region, and revoking it means redeploying all of them.
- A checker can post results for **any monitor in any workspace**, not just the ones it was
  assigned.

### How openstatus solves it

Read from `apps/private-location/internal/server/ingest_common.go`. Auth is a per-location
token in an `openstatus-token` header, and the lookup query is the authorization:

```sql
SELECT monitor.* FROM monitor
JOIN private_location_to_monitor a ON monitor.id = a.monitor_id
JOIN private_location b ON a.private_location_id = b.id
WHERE b.token = ? AND monitor.id = ?
```

The token does three jobs at once: authenticates the caller, **identifies which location it
is**, and scopes it to an explicitly assigned monitor subset. Their transport is ConnectRPC
with four RPCs (`Monitors`, `IngestHTTP`, `IngestTCP`, `IngestDNS`), which is the protobuf
form of the two verbs we already expose.

### Proposal

```ts
// packages/db/src/schema.ts
export const probeLocations = pgTable("probe_locations", {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),     // "EU West (Frankfurt)"
  region: varchar("region", { length: 50 }).notNull(),  // "eu-west"  — the stored discriminator
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("probe_locations_workspace_region_unique").on(t.workspaceId, t.region),
  uniqueIndex("probe_locations_token_hash_unique").on(t.tokenHash),
]);

// Which monitors a location may probe and report on.
export const probeLocationMonitors = pgTable("probe_location_monitors", {
  probeLocationId: uuid("probe_location_id").notNull().references(() => probeLocations.id, { onDelete: "cascade" }),
  monitorId: uuid("monitor_id").notNull().references(() => monitors.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.probeLocationId, t.monitorId] })]);
```

Rules:

- **Store a hash, not the token.** Unlike openstatus (plaintext `b.token = ?`), hash it —
  reuse the scrypt helper in `packages/auth/src/password.ts`. Show the plaintext once at
  creation. Lookup is by hash, so it stays a single indexed query.
- **`region` is derived from the token, never from the body.** Delete `region` from the
  probe-result Zod schema; the middleware resolves the location and puts it on the context.
  This is the security fix.
- **`GET /v1/probes/monitors` returns only assigned monitors**, via the join.
- **Bump `last_seen_at` on every ingest** — openstatus's `sendEventAndUpdateLastSeen`. Without
  it a dead checker and a healthy-but-unprobed service look identical. A location silent past
  a threshold should raise its own alert, not silently stop reporting.
- **Keep `PROBE_API_KEY` working** during migration; see rollout below.

## Problem 2 — `currentStatus` is a single scalar

`apps/api/src/routes/probes.ts:109-115` runs on every ingest:

```ts
.update(schema.monitors).set({
  currentStatus: body.status,          // one scalar — every region overwrites it
  consecutiveFailures: newConsecutiveFailures,
})
```

With three regions this produces three distinct failures:

1. **Status flapping.** `eu-west` writes `down`, `us-east` writes `up` two seconds later.
2. **Slack alert storms.** The transition logic compares the *global* `previousStatus` against
   *one region's* result. Region A down → `monitor.down`. Region B up → `monitor.recovered`.
   Repeats every probe cycle, forever.
3. **`consecutiveFailures` becomes meaningless**, so `autoIncidentThreshold` counts
   interleaved regions instead of sustained failure.

### Proposal

```ts
export const monitorRegionStatus = pgTable("monitor_region_status", {
  monitorId: uuid("monitor_id").notNull().references(() => monitors.id, { onDelete: "cascade" }),
  region: varchar("region", { length: 50 }).notNull(),
  status: monitorStatusEnum("status").notNull().default("unknown"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.monitorId, t.region] })]);
```

Ingestion becomes, inside the existing transaction:

1. Insert the `monitor_runs` row (unchanged).
2. Upsert **this region's** row in `monitor_region_status`. Per-region
   `consecutiveFailures` now means what it says.
3. Recompute the monitor's global status from all enabled regions' rows.
4. **Emit transition events only if the derived global status changed.** This is what kills
   the alert storm — events stop being per-probe and become per-actual-transition.
5. Write the derived value to `monitors.currentStatus`, which becomes a **cache** of the
   reduction rather than the source of truth. Keeping it avoids rewriting every read path.

### Aggregation policy

Add to `monitors`:

```ts
regionPolicy: monitorRegionPolicyEnum("region_policy").notNull().default("any"),
```

with `pgEnum("monitor_region_policy", ["any", "majority", "all"])`:

| Policy | Global status is `down` when | Use for |
|---|---|---|
| `any` | ≥1 region reports down | Default. Catches regional outages and bad routes. |
| `majority` | > half of regions report down | Noisy networks; tolerates one flaky probe. |
| `all` | every region reports down | "Is it globally dead?" — good for paging. |

`degraded` reduces the same way, below `down`. Regions reporting `unknown` (never checked,
or location disabled) are **excluded from the denominator** — otherwise adding a new region
instantly drags every monitor toward `unknown`.

Default `any` preserves today's single-region behavior exactly, which makes the migration a
no-op for existing users.

## Row volume

`monitor_runs` grows linearly with region count — N regions is N× the rows. At 4 monitors ×
60s × 5 regions that's ~432k rows/day.

Not a problem yet. `packages/db/src/retention.ts` already prunes, and the existing
`monitor_runs_monitor_checked_idx` still serves the common query. **Do not add TimescaleDB or
an analytics DB now.** Revisit partitioning `monitor_runs` by `checked_at` only when
retention pruning starts to hurt. This is the one place openstatus's architecture does not
transfer — they push results to Tinybird because they run 28 regions; we don't.

## Rollout

Additive and reversible. Each PR ships independently.

**PR-1 — schema.** Add all three tables plus the `region_policy` column and enum. Backfill
`monitor_region_status` from `monitors.currentStatus` as region `local` so nothing reads empty.
No behavior change.

**PR-2 — reduction logic.** Move ingest to per-region upsert + derived global status + gated
events. With one region and policy `any`, output is byte-identical to today. **This is the PR
that needs the most test coverage** — it's where alert-storm regressions would hide.

**PR-3 — per-location auth.** Add `probe_locations` and the resolve-token middleware.
Accept *either* a location token *or* the legacy `PROBE_API_KEY` (legacy maps to region
`local`, all monitors). Nothing breaks mid-deploy.

**PR-4 — admin UI.** CRUD for probe locations under `apps/web/src/app/dashboard/settings/`,
token shown once on creation, `last_seen_at` surfaced, monitor assignment. Region policy
picker on the monitor form.

**PR-5 — checker.** Swap `PROBE_API_KEY` for a location token; stop sending `region` in the
body. Document deploying one checker per region.

**PR-6 — public surface.** Per-region breakdown in `/v1/status` and the status page. Decide
then whether the public page shows per-region detail or only the rollup — the data supports
both.

**PR-7 — remove the legacy path.** Drop `PROBE_API_KEY` and the body `region` field. Breaking
change; needs a release note.

## Open questions

- **Should a silent location alert?** It needs a new event type (`location.silent`) and a
  sweeper — `apps/notifier/src/heartbeat-sweeper.ts` is the obvious model. Probably PR-4.5.
- **Per-monitor region assignment, or per-workspace?** openstatus does per-monitor via the
  join table. Per-monitor is more flexible; a workspace-wide default with per-monitor
  override may be friendlier. Leaning per-monitor with "assign all" as the UI default.
- **Should `regionPolicy` apply to `degraded` independently from `down`?** A monitor slow in
  one region but fine elsewhere is arguably degraded globally under `any`. Start with one
  policy for both; split later if it proves wrong.
- **Retry semantics per region.** `retryCount` currently retries within one checker. Should a
  region retry before reporting down, or should the reduction handle it? Leaning: keep
  per-checker retries as-is and let the reduction do cross-region debouncing.
