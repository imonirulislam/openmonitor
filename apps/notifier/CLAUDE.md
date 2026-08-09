# apps/notifier — Outbox consumer

Polls the `events` table, dispatches Slack messages to subscribed channels, retries on
transient failures, gives up after `MAX_ATTEMPTS`.

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
