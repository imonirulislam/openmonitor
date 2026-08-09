---
name: add-notification-channel
description: Add a new notification transport (email, PagerDuty, MS Teams, Discord, etc.) alongside the existing Slack one. Use when the user says "we also need to alert on X" or "support Y notifications."
---

# Add a notification channel type

V1 only ships Slack. The architecture supports adding more transports without disturbing
existing flows. Follow this checklist exactly.

## 1. Schema

Edit `packages/db/src/schema.ts`:

- Add the new value to `channelTypeEnum`:
  ```ts
  export const channelTypeEnum = pgEnum("channel_type", ["slack", "email"]);
  ```
- Update the `notificationChannels.config` JSONB type to a discriminated union:
  ```ts
  export type SlackChannelConfig = { kind: "slack"; webhookUrl: string };
  export type EmailChannelConfig = { kind: "email"; toAddresses: string[]; from: string };
  export type ChannelConfig = SlackChannelConfig | EmailChannelConfig;
  ```
  (and update the `.$type<ChannelConfig>()` annotation on the column)

Run `bun run db:generate`, review the migration, run `bun run db:migrate`.

## 2. Sender

Create `packages/notifications/src/<transport>.ts`:

```ts
export async function sendEmail(config: EmailChannelConfig, msg: EmailMessage): Promise<{
  ok: true
} | { ok: false; retryable: boolean; status: number; body: string }> { ... }
```

The return shape **must match Slack's** so the notifier's retry/backoff logic works
unchanged. `retryable: true` for transient failures (5xx, rate limits), `false` for config
errors (4xx other).

## 3. Renderer

Add `packages/notifications/src/templates-<transport>.ts` exporting `render<Transport>Message(type, payload)`.

Don't reuse the Slack renderer. Each transport has different formatting needs (HTML for
email, structured for PagerDuty). Keep them separate so changing one doesn't break others.

Update `packages/notifications/src/index.ts` to export the new sender + renderer.

## 4. Notifier dispatch

In `apps/notifier/src/worker.ts`, find the dispatch loop:

```ts
for (const channel of channels) {
  if (channel.type !== "slack") continue;
  // ...
}
```

Add a branch for the new type that calls your new sender. The retry/backoff/give-up
behavior is shared — your sender only needs to return the right `SendResult` shape.

## 5. Admin UI

In `apps/web/src/app/dashboard/channels/page.tsx`:
- Add a form section for creating channels of the new type.
- Add a corresponding server action in `apps/web/src/lib/actions/channels.ts`.

## 6. CLAUDE.md updates

Update `packages/notifications/CLAUDE.md` and `apps/notifier/CLAUDE.md` to mention the new
type so future agents know it exists.

## What NOT to do

- Don't call the transport directly from server actions. Always go through the events outbox.
- Don't reuse `webhookUrl` in the config schema for non-webhook transports — discriminate
  by `kind` so the type system catches misuse.
- Don't add per-transport retry policy in the sender. The notifier owns retry timing.
