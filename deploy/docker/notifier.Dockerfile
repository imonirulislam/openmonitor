# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock* ./
COPY turbo.json tsconfig.base.json ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json ./packages/db/
COPY packages/clickhouse/package.json ./packages/clickhouse/
COPY packages/notifications/package.json ./packages/notifications/
COPY apps/notifier/package.json ./apps/notifier/
# See web.Dockerfile for why the default isolated linker and no --frozen-lockfile.
RUN bun install

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo ./
COPY packages ./packages
COPY apps/notifier ./apps/notifier
WORKDIR /repo/apps/notifier
CMD ["node_modules/.bin/tsx", "src/index.ts"]
