# apps/web — Admin dashboard (Next.js 15)

Next.js App Router app. Auth-protected by middleware. All admin writes happen here via server
actions.

## Auth

- Auth.js v5 is wired in `src/auth.ts` (re-exporting `auth`, `handlers`, `signIn`, `signOut`).
- `src/middleware.ts` runs `auth` against every non-API route — unauthenticated users get
  redirected to `/login`.
- The auth config in `@openmonitor/auth` controls providers. Add SSO there, not here.

## Server actions

- All writes are server actions under `src/lib/actions/`. They:
  1. Call `requireEditor()` (or `requireAdmin()`) first.
  2. Validate input with Zod.
  3. Wrap multi-row writes in `db().transaction(...)`.
  4. **Insert into `events`** in the same transaction when the change should fire a notification.
  5. Call `revalidatePath` for any pages whose data changed.
- Don't put write logic in route handlers under `src/app/api/`. The only route handler is
  `app/api/auth/[...nextauth]/route.ts` (Auth.js).

## Roles

- `admin` — everything, including user management (TODO)
- `editor` — create/edit/delete monitors, incidents, maintenance, channels
- `viewer` — read-only

`requireEditor()` blocks viewers. Don't add a separate `requireAdmin()` guard until we have
admin-only screens — for now there are none.

## UI

- Tailwind CSS v4. Theme via CSS vars in `globals.css`.
- Shared components from `@openmonitor/ui` (`StatusBadge`, `UptimeBar`, `SeverityBadge`, `cn`).
- App-specific components in `src/components/`. Don't bloat `@openmonitor/ui` with one-off
  admin chrome — that package is for things shared with the public status page.

## Tailwind

- Tailwind v4 with `@import "tailwindcss"` in `globals.css`. No `tailwind.config.ts` needed
  for v4 unless you add custom theme.
- PostCSS is `@tailwindcss/postcss`.

## Adding a new admin screen

1. Add a route under `src/app/dashboard/<thing>/page.tsx`.
2. Add a nav entry to `src/app/dashboard/layout.tsx`.
3. Add server actions under `src/lib/actions/<thing>.ts`.
4. If the screen mutates data that should be public (e.g., new incident), make sure the action
   inserts a row into `events` so `apps/notifier` fires a Slack message.
