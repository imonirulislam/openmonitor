---
name: add-monitor
description: Add a new monitored service to the status page. Use when the user says "add a monitor for X" or "we have a new service Y to track."
---

# Add a monitor

OpenMonitor monitors are HTTP probes against an endpoint. Adding one is a database row, not a
code change.

## Preferred path: admin UI

For a running deployment, the user should go to **/dashboard/monitors/new** in `apps/web`
and fill the form. Don't do it via code unless they specifically ask you to.

## When you must do it via code (e.g., bootstrapping, seeded environments)

1. Open `packages/db/src/seed.ts`.
2. Add an entry to the `seedMonitors` array. Pattern:

   ```ts
   {
     slug: "kebab-case-id",      // unique, used in URLs
     name: "Display Name",
     description: "Optional human-readable description",
     url: "https://service.example.com/health",
     method: "GET",              // or POST/HEAD if the health endpoint requires it
     expectedStatus: 200,        // probe is "down" if status != this
     intervalSeconds: 60,        // 30s minimum
     timeoutMs: 10_000,          // probe abort threshold
   }
   ```

3. Run `bun run db:seed` — it's idempotent (`onConflictDoUpdate` on slug) so re-running won't
   duplicate.

## Or: `turbo gen monitor`

A generator exists: `bun run gen monitor`. It prompts and appends to the seed file. Convenient
but not required.

## After adding

- The Go checker picks it up automatically on its next refresh tick (default 30s).
- It will show on the public status page once the first probe runs.
- If the user wants Slack alerts, link the new monitor to a notification channel from
  **/dashboard/channels** (or create one first).

## What NOT to do

- Don't define monitors in TypeScript constants outside the database. Monitors are runtime
  config; new ones must not require a redeploy.
- Don't bypass `expectedStatus` validation by adding monitor-specific code paths. If a
  service has a non-standard health response, fix the service, or set `expectedStatus`
  appropriately.
