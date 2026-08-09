---
name: add-event-type
description: Add a new event type to the outbox so notifications fire on a new state transition. Use when the user says "send a Slack message when X happens" or "alert on Y."
---

# Add an event type

The outbox `events` table is the single funnel for everything that fans out to Slack (and
future channels). Adding a new triggerable event is three coordinated changes.

## 1. Schema

In `packages/db/src/schema.ts`, add the value to `eventTypeEnum`:

```ts
export const eventTypeEnum = pgEnum("event_type", [
  // ...existing values
  "monitor.flapping",   // your new value
]);
```

Hand-write the migration (`ALTER TYPE "event_type" ADD VALUE '...';` — Postgres adds enum
values cleanly) and add a `_journal.json` entry. Don't run `db:generate`; the snapshot chain
is stale and it emits destructive SQL. Then
run `bun run db:migrate`.

## 2. Renderer

In `packages/notifications/src/templates.ts`:

- Add a payload type alongside the existing ones (e.g., `MonitorFlappingPayload`).
- Add a `case` to `renderSlackMessage`:

```ts
case "monitor.flapping":
  return monitorFlapping(payload as unknown as MonitorFlappingPayload);
```

- Add the renderer function. Pick a Block Kit color/format that distinguishes it from
  similar events (don't reuse the down/up red/green if it's something else).

Update `packages/notifications/src/index.ts` exports.

## 3. Producer

Find the place that detects the transition. For monitor-derived events, that's almost
always `apps/api/src/routes/probes.ts` — the API decides up/down/degraded transitions
when ingesting probe results.

For incidents/maintenance, it's a server action in `apps/web/src/lib/actions/`.

Insert into `events` **inside the same transaction** as the state change:

```ts
await tx.insert(schema.events).values({
  type: "monitor.flapping",
  payload: { monitor: { id, slug, name, url }, ...transitionDetails },
});
```

Payload shape **must include `monitor.id`** (for `monitor.*` events) or
`monitorIds: string[]` (for `incident.*` / `maintenance.*` events) so the notifier can
route to the right channels. See `apps/notifier/CLAUDE.md` for the routing rules.

## 4. Test

```bash
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Trigger the transition (post a probe result, open an incident, etc.) and watch the
notifier logs. The event should be picked up within `POLL_INTERVAL_MS`.

If you don't have a Slack webhook configured yet, the notifier marks the event as `sent`
with no recipients — that's expected and not a bug. Add a channel via the admin UI to see
the actual message.

## What NOT to do

- Don't call the renderer/sender directly from the producer. Always go through the outbox.
  This is enforced by convention; the linter won't catch it.
- Don't include large strings in the payload (logs, stack traces). The events table isn't
  meant to grow unbounded. If you need debug context, log it elsewhere and put a reference
  (e.g., a log query URL) in the payload.
- Don't add an event type and forget to handle it in the renderer's switch. The
  `exhaustive: never` check at the bottom of `renderSlackMessage` will catch this at
  compile time — pay attention to the TypeScript error.
