# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock* bunfig.toml turbo.json tsconfig.base.json ./
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/clickhouse/package.json ./packages/clickhouse/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/regions/package.json ./packages/regions/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/notifier/package.json ./apps/notifier/
COPY apps/status-page/package.json ./apps/status-page/
COPY apps/web/package.json ./apps/web/
# See web.Dockerfile for why the default isolated linker and no --frozen-lockfile.
RUN bun install

FROM deps AS build
COPY packages ./packages
COPY apps/status-page ./apps/status-page
RUN bun run --filter @openmonitor/status-page build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/status-page /app/apps/status-page
WORKDIR /app/apps/status-page
EXPOSE 5003
CMD ["/app/node_modules/.bin/next", "start", "--port", "5003"]
