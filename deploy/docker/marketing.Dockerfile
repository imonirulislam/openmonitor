# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
# Only the workspaces marketing actually needs. bun errors if a workspace that
# *is* present has a workspace dependency that isn't, so this set has to be
# closed under dependencies — but nothing here depends on db or clickhouse,
# which is the point: the marketing site has no datastore.
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/
COPY apps/marketing/package.json ./apps/marketing/
# See web.Dockerfile for why the default isolated linker and no --frozen-lockfile.
RUN bun install

FROM deps AS build
COPY packages/tsconfig ./packages/tsconfig
COPY packages/ui ./packages/ui
COPY apps/marketing ./apps/marketing
RUN bun run --filter @openmonitor/marketing build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/marketing /app/apps/marketing
WORKDIR /app/apps/marketing
EXPOSE 5005
CMD ["node_modules/.bin/next", "start", "--port", "5005"]
