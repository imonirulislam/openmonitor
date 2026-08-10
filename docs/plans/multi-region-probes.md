# Multi-region probes

How probe locations authenticate, and how per-region results become one status.

## Probe authentication

A checker authenticates with a **probe-location token**. The token is the location's
identity: the server looks up `probe_locations` by token hash and takes `region` from that
row. Clients never send a region.

```
probe_locations           id, workspace_id, name, region, token_hash, last_seen_at, enabled
probe_location_monitors   (probe_location_id, monitor_id)
```

`probe_location_monitors` is the authorization check. `GET /v1/probes/monitors` returns only
assigned monitors, and `POST /v1/probes/results` rejects anything else. Both reject with 404
rather than 403, so a token can't be used to discover which monitors exist.

There is no shared-key fallback. A single global key can't say *which* region is calling, so
the region would have to come from the request body — letting any key holder attribute
results to any region, and making one leaked key unrevocable without redeploying every
checker. `PROBE_API_KEY` still guards `/v1/system/*`; that's a separate credential for
operational endpoints and can't post probe results.

Every successful ingest bumps `last_seen_at`. Without it, a checker that has died and a
service nobody is probing look identical — both just stop producing rows.

### Token storage

Tokens are 32 random bytes, prefixed `omp_`, stored as an **unsalted SHA-256 digest**
(`packages/db/src/probe-token.ts`).

Not the salted scrypt used for user passwords. `hashPassword` salts randomly, so the digest
differs every call and there's nothing to look up by — matching would mean scanning every
location and running a deliberately slow KDF against each, on every ingest. Salting and key
stretching exist to make offline brute force expensive against low-entropy human passwords;
256 bits of CSPRNG output has no dictionary to precompute. SHA-256 is safe here and directly
indexable.

Only the hash is persisted. Plaintext is shown once, at creation.

## Deriving status from regions

`monitors.current_status` is a single scalar. With more than one location, every region would
overwrite it: status flaps, `consecutive_failures` counts interleaved regions, and transition
events fire per probe instead of per actual change — one region reporting down while another
reports up emits `monitor.down` and `monitor.recovered` on every cycle, forever.

`monitor_region_status` holds one row per `(monitor_id, region)` with that region's own status
and failure counter. On ingest the API upserts this region's row, reads all rows for the
monitor, and reduces them to a global status via `reduceRegionStatuses`
(`packages/db/src/region-status.ts`). Transition events compare against that derived value,
not against the incoming probe. `monitors.current_status` becomes a cache of the reduction so
read paths don't have to aggregate.

`monitors.consecutive_failures` tracks sustained *derived* down-ness, which is what
`auto_incident_threshold` is meant to measure. Per-region counters live in
`monitor_region_status`.

### Reduction policy

`monitors.region_policy` selects how the rows reduce:

| Policy | Down when | Use for |
|---|---|---|
| `any` | >=1 region reports down | Default. Catches regional outages and bad routes. |
| `majority` | more than half report down | Noisy networks; tolerates one flaky probe. |
| `all` | every region reports down | "Is it globally dead?" - good for paging. |

`degraded` reduces the same way but ranks below `down`; a region that is down also counts
toward a degraded majority.

Regions at `unknown` — never probed, or disabled before first report — are excluded from the
denominator. Counting them would drag healthy monitors toward `unknown` the moment a location
is added, and would make `majority` depend on how many locations exist rather than how many
actually report.

All three policies agree when exactly one region reports, so single-location installs behave
identically regardless of the configured policy.

### Settling

Because only reporting regions count, the derived status moves while a new set of locations
reports in for the first time: the first to report is briefly the only one, so it decides the
outcome alone until its peers arrive.

This is not flapping — it happens once, on the way in, then stops. After all regions have
reported, six probes with one region permanently down and another permanently up produce zero
events under both `all` and `majority`. When adding a location to a live workspace, create it
disabled and enable it once it has reported.

## Running a second region

The checker needs outbound HTTPS to `apps/api` and its own `PROBE_TOKEN`. It does not need
database access — `listener.go` uses `LISTEN/NOTIFY` for instant refresh when `DATABASE_URL`
is set, and falls back to interval polling when it isn't. Postgres is never exposed.

Give each location its own token. Never share one across regions.

## Row volume

`monitor_runs` grows linearly with location count. At 4 monitors x 60s x 5 regions that's
roughly 432k rows/day. `packages/db/src/retention.ts` prunes; the existing
`monitor_runs_monitor_checked_idx` still serves the hot query.

Partitioning `monitor_runs` by `checked_at` is the next move if pruning stops keeping up. An
analytics store is not — openstatus pushes results to Tinybird because they run 28 regions
across 3 clouds, and that doesn't transfer to a single Postgres.

## Not built yet

- **Admin UI for probe locations.** Creating one currently means an insert plus
  `hashProbeToken`. Needs CRUD, monitor assignment, one-time token reveal, and `last_seen_at`
  surfaced.
- **Region policy picker** on the monitor form.
- **Per-region breakdown** in `/v1/status` and on the public page. The data supports both a
  rollup and a per-region view; which to show is undecided.
- **Silent-location alerting.** `last_seen_at` is recorded but nothing watches it. Wants a
  `location.silent` event type and a sweeper — `apps/notifier/src/heartbeat-sweeper.ts` is the
  model.

## Open questions

- Should region assignment be per-monitor (as now) or a workspace-wide default with
  per-monitor override? Per-monitor is more flexible; the UI default should probably be
  "assign all".
- Should `region_policy` apply to `degraded` independently from `down`? A monitor slow in one
  region but fine elsewhere is arguably degraded globally under `any`.
- `retry_count` retries within a single checker. Should a region retry before reporting down,
  or should the reduction absorb it? Currently the former.
