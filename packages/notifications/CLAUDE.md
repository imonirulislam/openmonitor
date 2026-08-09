# packages/notifications — Slack (and future channels)

Pure functions: render an event into a Slack message, then `sendSlack(url, msg)`. No DB,
no scheduling, no retry policy — those live in `apps/notifier`.

## Adding a new event type

1. Add the value to `eventTypeEnum` in `packages/db/src/schema.ts` (run a migration).
2. Add a payload type to `src/templates.ts`.
3. Add a `case` to `renderSlackMessage`.
4. Producers (`apps/web` server actions, `apps/checker`, `apps/api`) emit the event by inserting
   into the `events` table. The notifier picks it up automatically.

## Adding a new transport (email, PagerDuty, …)

1. Add a value to `channelTypeEnum` in the schema (e.g., `"email"`).
2. Update the `notification_channels.config` JSONB type in the schema with a discriminated union.
3. Create `src/<transport>.ts` exporting a `send<Transport>(config, msg)` function with the same
   `SendResult` shape (`ok | { retryable, ... }`).
4. Create a renderer alongside it (templates may differ — email is HTML, PagerDuty is
   structured JSON). Don't reuse the Slack renderer.
5. Wire it into `apps/notifier`'s dispatch switch.

## Slack message conventions

- Use `attachments[].color` for severity (green `#22c55e`, red `#ef4444`, amber `#fb923c`,
  blue `#3b82f6` for maintenance).
- Always include a top-level `text` for desktop notifications and screen readers — Slack uses
  it as the fallback when blocks fail to render.
- Use `header` block for the headline, `section` blocks for fields, `context` for timestamps
  and links.
- Don't send an "@channel" or "@here" mention — let downstream Slack workflow rules decide
  loudness.
