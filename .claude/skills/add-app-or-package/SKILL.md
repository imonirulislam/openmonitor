---
name: add-app-or-package
description: Scaffold a new app under apps/ or a new package under packages/ following monorepo conventions. Use when the user says "add a new service" or "split this into a package."
---

# Add a new app or package

Use the existing turbo generator when possible — it produces files with the right wiring.

## Quick path

```bash
bun run gen package      # interactive: creates packages/<name>/
bun run gen hono-app     # interactive: creates apps/<name>/ as a Hono service
```

## When the generator isn't enough

The generator handles common cases. For non-Hono apps (Next.js, Go, worker that needs DB),
copy the closest existing app and adjust:

| Want                     | Copy                         |
|--------------------------|------------------------------|
| Next.js app              | `apps/status-page` (public) or `apps/web` (auth) |
| Hono web service         | `apps/api`                   |
| Background worker (TS)   | `apps/notifier`              |
| Go binary                | `apps/checker`               |
| Library package          | `packages/notifications` (server) or `packages/ui` (client) |

## Required files for any new package/app

- `package.json` with `"name": "@openmonitor/<name>"`, `"private": true`, `"type": "module"`,
  and `workspace:*` deps to internal packages.
- `tsconfig.json` extending `@openmonitor/tsconfig/base.json`, `node.json`, or `nextjs.json`.
- `src/index.ts` (or app-specific entry).
- `CLAUDE.md` documenting the package's purpose and conventions.

## Things to verify after creating

1. **`bun install`** at the root succeeds. New workspaces are auto-discovered via
   the root `package.json` `workspaces` field.
2. **`bun run typecheck`** passes — fix imports and types before moving on.
3. **`bun run lint`** passes — biome and oxlint both run; the `apps/checker` Go directory
   is excluded.
4. **`knip.json`** — if the new app's entry isn't covered by the existing `apps/*` /
   `packages/*` glob (e.g., a non-standard entry file), add it explicitly.
5. **`turbo.json`** — usually no change needed; the global `tasks` apply. Add an explicit
   override only if the app has unique outputs/inputs.
6. **Dockerfile** — add `deploy/docker/<name>.Dockerfile` if the app gets deployed.
7. **k8s manifest** — add `deploy/k8s/<name>.yaml` if the app gets deployed.
8. **CLAUDE.md** at the new app/package root, plus a mention in the top-level CLAUDE.md
   architecture map if it's an app or a major package.

## What NOT to do

- Don't bypass `@openmonitor/tsconfig`. If a setting feels wrong for everyone, change it in
  the shared preset, not as a one-off override.
- Don't add a new framework (Express, Fastify, Koa) "because that's what I know." Stick
  with Hono for TS web services so we have one set of patterns to maintain.
- Don't introduce a new package manager, monorepo tool, or test runner. bun + turbo is
  the deal.
- Don't make a package depend on `@openmonitor/db` *and* `@openmonitor/api-client`. That's a
  layering mistake — pick the right side.
