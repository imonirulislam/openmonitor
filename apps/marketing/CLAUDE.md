# apps/marketing — Landing page (Next.js 15)

The root domain. Static pages plus links out.

## It talks to nothing

No `@openmonitor/db`, no `api-client`, no fetch to `apps/api`, no `DATABASE_URL`. The
Dockerfile copies only `packages/ui`, `packages/tsconfig` and itself.

A marketing site's job during an incident is to stay up and point at the status page, so it
must not share a failure mode with the thing that's broken. Want live data here? Fetch it
client-side so a failure degrades the widget, not the page.

The only thing it knows about other services is their URLs: `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_STATUS_PAGE_URL`, `NEXT_PUBLIC_REPO_URL`. Defaults are the local compose ports.

## Copy

Every claim on the page is a feature that exists — monitor kinds come from `monitorKindEnum`,
"Slack" is singular because `channelTypeEnum` has one value. Update the page when a feature
lands; don't let it run ahead of the code.

## Rest

Port 5005. Shares `@openmonitor/ui` and the theme tokens unmodified — the status page's sharp
corners are its own departure, not the house style. Chrome is in
`src/components/site-chrome.tsx`. On Vercel it's its own project with Root Directory
`apps/marketing`; see [DEPLOYMENT.md](../../DEPLOYMENT.md).
