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
| `API_URL`                     | `http://localhost:5002`  |
| `PROBE_API_KEY`               | required                 |
| `PROBE_TOKEN`                 | _(required)_             |
| `CHECKER_REFRESH_INTERVAL`    | `30s`                    |
| `CHECKER_DEFAULT_TIMEOUT_MS`  | `10000` (or as duration) |

## Stdlib only

No external Go modules. `go.mod` is empty on purpose — stdlib `net/http`, `encoding/json`,
`context`, `time` are enough.

## What this does NOT do

- No DB access. Goes through the API. (Cheaper than two networking codebases to maintain.)
- No retry on probe-result POST failures yet. If the API is down, results are dropped.
  When that becomes a problem, add a small in-memory ring buffer with timed flush —
  don't add a local SQLite cache.
- No alerting. The API decides which probe results count as transitions and emits events.
