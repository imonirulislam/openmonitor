# apps/status-page — Public status page (Next.js 15)

Public, read-only. Calls `apps/api` for data; never touches the database directly.

## Why it's separate from `apps/web`

Different blast radius and traffic profile:
- This page must stay up *during* incidents — it's where customers go to find out what's wrong.
- It's cacheable and high-throughput; admin is private and low-throughput.
- Deploying the admin app should never put the public page at risk.

## Data flow

- All reads go through `@openmonitor/api-client` against `process.env.API_URL` (server-side).
- `revalidate = 30` on the home page — at most one DB hit every 30s per node.
- No server actions. No mutations. If a route needs a write, it belongs in `apps/web`.

## Conventions

- Don't import from `@openmonitor/db` here. The boundary is the API. If you need a new shape,
  add it to `apps/api/src/routes/status.ts` and `@openmonitor/api-client`.
- Don't add auth. The whole site is public.
- Don't fetch from the client unless absolutely necessary — server components are cheaper and
  cache better. If you need live updates, use server-sent events from the API or a polling
  client component, but consider whether 30s revalidate is good enough first.

## Theming

Customize `NEXT_PUBLIC_STATUS_TITLE` and `NEXT_PUBLIC_STATUS_DESCRIPTION`. For a real custom
theme, edit `globals.css` and the Tailwind classes — there's no theming system yet, on
purpose. Add one when there's a second brand to support.
