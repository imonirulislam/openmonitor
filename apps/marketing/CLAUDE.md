# apps/marketing — Public marketing site (Next.js 15)

The landing page at the root domain. Static pages plus links out to the dashboard, the status
page and GitHub.

## The rule that matters

**This app talks to nothing.** No `@openmonitor/db`, no `@openmonitor/api-client`, no fetches
to `apps/api`, no `DATABASE_URL`, no `CLICKHOUSE_URL`. Its Dockerfile deliberately copies only
`packages/ui`, `packages/tsconfig` and itself.

That isn't minimalism for its own sake. A marketing site's one job during an incident is to
stay up and point at the status page — so it must not share a failure mode with the thing
that's broken. If you find yourself wanting live data here (current uptime, a monitor count),
fetch it client-side from `apps/api` so a failure degrades the widget instead of the page,
or don't.

The only thing it knows about other services is their URLs, from
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STATUS_PAGE_URL` and `NEXT_PUBLIC_REPO_URL`. Defaults are
the local compose ports so `bun run dev` works with no setup.

## Copy

Every claim on the page is a feature that exists. Monitor kinds come from `monitorKindEnum`,
region policies from `monitorRegionPolicyEnum`, "Slack" is singular because `channelTypeEnum`
has one value, and the storage figure was measured rather than estimated.

When a feature lands, update the page. When you're tempted to describe a roadmap item as
though it ships, don't — the audience for a self-hostable tool will check, and the repo is
right there.

## Look

Shares `@openmonitor/ui` and the same JetBrains Mono setup as the dashboard, using the theme
tokens unmodified. Someone arriving here should recognise the app they sign in to. The status
page's sharp corners are its own deliberate departure and aren't the house style.

## Routes

One page today (`src/app/page.tsx`). Add more as plain App Router routes. Chrome lives in
`src/components/site-chrome.tsx`.

## Where it runs

Port 5005 locally. On Vercel it's its own project with Root Directory `apps/marketing` —
see [DEPLOYMENT.md](../../DEPLOYMENT.md). It belongs on the **root domain**; the dashboard is
one subdomain (`app.`) shared by every tenant, and per-workspace subdomains are for status
pages only.
