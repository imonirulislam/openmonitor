# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock* bunfig.toml ./
COPY turbo.json tsconfig.base.json ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/clickhouse/package.json ./packages/clickhouse/
COPY apps/api/package.json ./apps/api/
# See web.Dockerfile for why the default isolated linker and no --frozen-lockfile.
# Only the manifests this service needs are copied, so the install stays small.
RUN bun install

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
# /repo from deps is just manifests + the per-workspace node_modules symlink
# farms; copying it whole keeps those relative links valid. Source is layered on
# top afterwards (.dockerignore keeps node_modules out of the build context).
COPY --from=deps /repo ./
COPY packages ./packages
COPY apps/api ./apps/api
WORKDIR /repo/apps/api
EXPOSE 5002
CMD ["/repo/node_modules/.bin/tsx", "src/index.ts"]
