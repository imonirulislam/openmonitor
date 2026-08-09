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

Argon2id, defaults from the `argon2` package. We don't expose tunable parameters — if we ever
need to (e.g., to migrate to higher cost), do it in `src/password.ts` with a versioning prefix
on the hash so old hashes still verify.

## What this package does NOT do

- It does not export Next.js route handlers. `apps/web/src/auth.ts` calls `NextAuth(authConfig)`
  and exports the handlers there — keeping the framework-specific glue in the app, not the package.
- It does not gate routes. Use `auth()` from `apps/web/src/auth.ts` in server components or
  middleware.
