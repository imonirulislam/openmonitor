# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/notifier/package.json ./apps/notifier/
COPY apps/status-page/package.json ./apps/status-page/
COPY apps/web/package.json ./apps/web/
# Bun's default isolated linker gives every workspace its own node_modules of
# symlinks. Keep it: `next build` typechecks, and hoisting next-auth to the repo
# root makes the inferred type of `auth` unnameable from apps/web/src/auth.ts.
# Not --frozen-lockfile: some images copy only a subset of workspace manifests,
# which a full-workspace lockfile check would reject.
RUN bun install

FROM deps AS build
COPY packages ./packages
COPY apps/web ./apps/web
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime
ENV SKIP_ENV_VALIDATION=1
RUN bun run --filter @openmonitor/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy whole trees so the isolated linker's relative symlinks stay valid:
# apps/web/node_modules/* -> ../../../node_modules/.bun/* and ../../../../packages/*
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/web /app/apps/web
WORKDIR /app/apps/web
EXPOSE 5001
CMD ["node_modules/.bin/next", "start", "--port", "5001"]
