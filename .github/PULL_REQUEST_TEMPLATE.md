## What and why

<!-- What changes, and what problem it solves. The diff shows what; explain why. -->

Closes #

## How it was verified

<!-- What you actually ran or exercised. Be specific — "typecheck passes" is fine for a
     refactor, but a behavior change deserves more. -->

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `go build ./... && go vet ./...` passes (only if `apps/checker` changed)
- [ ] Exercised the change by running the app

## Database changes

<!-- Delete this section if the schema didn't change. -->

- [ ] Schema edited in `packages/db/src/schema.ts` (not in app code)
- [ ] Migration generated with `bun run db:generate` and the SQL reviewed by hand
- [ ] Safe to run against a database that already has rows
- [ ] No previously shipped migration was edited

## Checklist

- [ ] Notification-triggering writes insert into the `events` outbox in the same
      transaction — Slack is never called directly from a write path
- [ ] Admin writes are server actions in `apps/web`, not endpoints in `apps/api`
- [ ] `apps/status-page` still doesn't import `@openmonitor/db`
- [ ] Server-only packages aren't imported into client components
- [ ] Request bodies and form input are validated with Zod at the boundary
- [ ] No new lint warnings introduced

## Anything reviewers should know

<!-- Trade-offs, follow-up work, parts you're unsure about, screenshots for UI changes. -->
