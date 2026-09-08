# apps/checker — HTTP probe worker (Go)

Stateless worker. Pulls the list of enabled monitors from `apps/api`, runs HTTP probes on a
per-monitor interval, posts results back. Multiple replicas can run safely — the API is the
source of truth for monitor state and emits events on transitions.

## Why Go

- Cheap per-probe overhead (one goroutine, low memory).
- Simple deploy: single static binary, `FROM scratch` image.
- Easy to add per-region replicas — give each deployment its own `PROBE_TOKEN`.
  The region is a property of the token, resolved server-side, so a checker can't
  attribute results to a region it isn't.

## Design

- `runner.go` keeps a goroutine per monitor. Each goroutine ticks at the monitor's interval.
- Refreshes the monitor list every `CHECKER_REFRESH_INTERVAL` (default 30s) — picks up new
  monitors and stops probes for monitors that were deleted/disabled.
- Initial probe is jittered by `now % interval` so a fleet restart doesn't dogpile all
  monitors at the same instant.
- `MIN_INTERVAL` is 10s, hardcoded, to keep us from accidentally creating a DDoS tool.

## Configuration

| Env var                       | Default                  |
|-------------------------------|--------------------------|
| `PROBE_TOKEN`                 | **required** — fatal if unset |
| `API_URL`                     | `http://localhost:5002`  |
| `CHECKER_REFRESH_INTERVAL`    | `30s`                    |
| `CHECKER_DEFAULT_TIMEOUT_MS`  | `10000` (or as duration) |
| `DATABASE_URL`                | unset — see below        |

`PROBE_TOKEN` is the whole identity: the region is a property of the token, resolved
server-side. Get one from Settings → Probe locations; it's shown once, because only its
SHA-256 hash is stored. A lost token is rotated, not recovered.

## Stdlib only

No external Go modules. `go.mod` is empty on purpose — stdlib `net/http`, `encoding/json`,
`context`, `time` are enough.

## What this does NOT do

- No DB access for probe data — monitors and results both go through the API.

  `DATABASE_URL` is the one exception and it's optional: when set, the checker also
  `LISTEN`s on `pg_notify('monitor_changed', …)` and refreshes immediately instead of
  waiting up to `CHECKER_REFRESH_INTERVAL`. `deploy/vm` deliberately leaves it unset so the
  probe box holds no Postgres credentials; the cost is up to 30s to pick up a new monitor.
- No retry on probe-result POST failures yet. If the API is down, results are dropped.
  When that becomes a problem, add a small in-memory ring buffer with timed flush —
  don't add a local SQLite cache.
- No alerting. The API decides which probe results count as transitions and emits events.
