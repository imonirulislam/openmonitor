---
name: add-auth-provider
description: Add an SSO provider (Google, JumpCloud, Okta, Azure AD, GitHub, generic OIDC) to the admin login. Use when the user says "set up SSO" or "let users log in with X."
---

# Add an authentication provider

Admin auth is Auth.js v5. Email/password is the default; SSO is purely additive.

## 1. Pick the provider type

- **Built-in** — Google, GitHub, etc. Auth.js ships providers for these. Use the prebuilt
  module.
- **Generic OIDC** — JumpCloud, Okta, Azure AD, Auth0, custom IdPs. Use the `oidc` provider
  type with an `issuer` URL.

## 2. Edit `packages/auth/src/providers.ts`

Find the commented-out examples. Uncomment the matching one and configure it.

### Google

```ts
import Google from "next-auth/providers/google";
// in providers array:
Google({
  clientId: process.env.AUTH_GOOGLE_ID!,
  clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  allowDangerousEmailAccountLinking: true,
}),
```

### JumpCloud / generic OIDC

```ts
{
  id: "jumpcloud",
  name: "JumpCloud",
  type: "oidc",
  issuer: process.env.AUTH_JUMPCLOUD_ISSUER!,   // e.g. https://oauth.id.jumpcloud.com/
  clientId: process.env.AUTH_JUMPCLOUD_ID!,
  clientSecret: process.env.AUTH_JUMPCLOUD_SECRET!,
  authorization: { params: { scope: "openid email profile" } },
},
```

`allowDangerousEmailAccountLinking: true` is the right default for SSO flows where the
user already has a Credentials account with the same email — without it, Auth.js refuses
to link and the user gets stuck. Don't toggle it off unless you've added a separate
account-linking flow.

## 3. Env vars

Add to:
- `.env.example` — uncomment / add the new vars.
- `deploy/k8s/secrets.example.yaml` — add stringData entries for production.

For OIDC, the IdP needs to know our callback URL: `${AUTH_URL}/api/auth/callback/<provider-id>`.
Configure that in the provider's admin console (e.g., `https://status-admin.example.com/api/auth/callback/jumpcloud`).

## 4. Login page

`apps/web/src/app/login/page.tsx` only renders the credentials form. Add a button per SSO
provider that calls `signIn("provider-id", { redirectTo: callbackUrl })` from a server
action. Pattern:

```tsx
<form action={async () => { "use server"; await signIn("jumpcloud", { redirectTo: callbackUrl }); }}>
  <button type="submit">Sign in with JumpCloud</button>
</form>
```

## 5. Role assignment for new users

By default, Auth.js will create a `users` row for SSO sign-ups with `role: "viewer"`. The
user shows up in the database with no password hash and a linked `accounts` row. An admin
must promote them via the admin UI (TODO: build that screen).

If you want to auto-promote based on email domain or IdP group claim:
- In `packages/auth/src/config.ts`, add a `signIn` callback that inspects `account.id_token`
  / `profile` and sets the role on first login.
- Don't hardcode admin emails in code. Use an env var like `AUTH_ADMIN_EMAILS` with a
  comma-separated list, or rely on IdP groups.

## 6. Test

1. `bun run dev` (or rebuild prod).
2. Open `/login`, click the new provider button.
3. Sign in. Confirm redirect back to `/dashboard`.
4. Check the database: `users` should have the new row, `accounts` should have a row
   linking provider id → user id.

## What NOT to do

- Don't replace the Credentials provider. Keep email/password for break-glass admin access.
- Don't put SSO logic in `apps/web` directly. The provider config belongs in
  `packages/auth/src/providers.ts` so it's testable and replaceable.
- Don't trust IdP-claimed email without verification. Both Google and OIDC should set
  `email_verified: true`; if they don't, refuse the sign-in via a `signIn` callback.
