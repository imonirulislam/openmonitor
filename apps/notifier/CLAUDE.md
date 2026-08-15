# apps/notifier — Outbox consumer

Drains the `events` table, dispatches Slack messages to subscribed channels, retries on
transient failures, gives up after `MAX_ATTEMPTS`.

## Two ways to drive it

The same functions run either way; only the trigger differs.

- **`NOTIFIER_POLL=on`** (default) — the loop in `src/index.ts` paces itself. Right for a
  container that stays up: docker compose, Fly.
- **`NOTIFIER_POLL=off`** — nothing is resident to hold a timer, so an external scheduler
  POSTs the endpoints below. Right for serverless.

| Method | Path           | Auth          | Purpose |
|--------|----------------|---------------|---------|
| GET    | `/health`      | none          | Platform health check |
| POST   | `/cron/drain`  | `CRON_SECRET` | One outbox batch |
| POST   | `/cron/sweep`  | `CRON_SECRET` | Heartbeats + probe locations |

`CRON_SECRET` unset means `/cron/*` refuses everything — an open drain endpoint lets anyone
burn the retry budget on every pending event.

Both endpoints are safe to call concurrently, and safe to call while the loop is running:
the claim uses `FOR UPDATE SKIP LOCKED` and the sweeps are guarded by `silent_alerted_at` /
`current_status`, so overlapping invocations do less work rather than duplicate work. Running
both modes at once still wastes effort, so pick one per deployment.

Outcomes are recorded in `scheduled_task_runs` (`notifier.drain`, `notifier.sweep`) because a
cron invocation is gone by the time anyone asks how it went.

## Behavior

- **Polling interval**: `POLL_INTERVAL_MS` (default 5s). Don't drop below 1s in production.
- **Concurrency-safe**: claim batch uses `FOR UPDATE SKIP LOCKED`, so multiple replicas can run.
- **Retry policy**: exponential backoff `2^attempts` seconds, capped at 600s. Max 6 attempts,
  then status flips to `failed` and `last_error` is preserved.
- **Retryable vs not**: Slack 429 + 5xx are retryable. 4xx (other) are config-broken — give up
  immediately on the first failure for that channel and let admins fix the webhook.

## Channel routing

For `monitor.*` events: send to channels linked to that monitor.

For `incident.*` and `maintenance.*` events: the producer must put `monitorIds: string[]` in
the payload; we send to channels linked to any of those monitors. If the array is empty, the
event is marked sent with no recipients (no Slack noise for "incidents about nothing").

## Adding a new channel type

1. Add the type to `channelTypeEnum` in `packages/db/src/schema.ts`.
2. Add a sender in `packages/notifications/src/<type>.ts`.
3. Add a `case channel.type === "<type>"` branch to the dispatch loop in `src/worker.ts`.
4. The retry/backoff logic is shared — your sender just needs to return
   `{ ok: true } | { ok: false; retryable: boolean; ... }`.

## Failure surface

There is no DLQ table — failed events stay in `events` with `status = 'failed'`. Admin UI
surfaces them in a "Notifications" section so operators can read the error and replay manually
(by setting `status = 'pending'` + `attempts = 0`). Don't auto-replay; that's the job of the
person who fixes the underlying problem.
