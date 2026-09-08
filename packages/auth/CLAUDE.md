# packages/auth — Authentication

Auth.js v5 (NextAuth) with the Drizzle adapter. Used by `apps/web` (admin).

## Design

- **Strategy: JWT.** No DB session table reads on every request — fast for dashboard rendering.
  The `sessions` table is still in the schema because the Drizzle adapter expects it for
  account linking and OIDC flows, but Credentials login does not write to it.
- **Roles live in the JWT.** `role` is loaded into the token on `jwt({ user })` and surfaced on
  `session.user.role`. Don't hit the DB on every request to fetch the role.
- **Email is the identity key.** `users.email` is uniquely indexed and lowercased on insert.
  When SSO providers are enabled, `allowDangerousEmailAccountLinking: true` links by email so
  a Credentials user can sign in via Google/JumpCloud later without creating a duplicate.

## Adding a new SSO provider

1. Open `src/providers.ts`. Pick the matching pattern in the commented examples (Google or JumpCloud).
2. Uncomment the provider entry and import.
3. Add the env vars to `.env.example` (and to your secret store for production).
4. For generic OIDC (JumpCloud, Okta, Azure AD), use `type: "oidc"` and supply `issuer` —
   Auth.js auto-discovers the rest via well-known config.
5. Restart the web app. New users authenticated via the provider get `role: "viewer"` by default.
   Promote them via the admin UI.

## Password hashing

scrypt from `node:crypto`. Hashes carry their parameters — `scrypt$N=…$salt$hash` — so the
cost can be raised later and old hashes still verify.

## Bootstrap

There is no signup route. `src/bootstrap.ts` creates the first workspace and admin on an empty
database:

```bash
ADMIN_EMAIL=you@example.com bun run --filter @openmonitor/auth bootstrap
```

Generates a password and prints it once unless `ADMIN_PASSWORD` is set. Idempotent — an
existing email keeps its password and only gains the membership. It lives here rather than in
`packages/db` because it needs the hasher, and db importing auth would be a cycle.

Don't use `db:seed` for this: it writes demo monitors and probe tokens whose values are in the
repository.

## What this package does NOT do

- It does not export Next.js route handlers. `apps/web/src/auth.ts` calls `NextAuth(authConfig)`
  and exports the handlers there — keeping the framework-specific glue in the app, not the package.
- It does not gate routes. Use `auth()` from `apps/web/src/auth.ts` in server components or
  middleware.
