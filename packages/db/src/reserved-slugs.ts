/**
 * Slugs nobody may claim.
 *
 * A workspace slug becomes a hostname once `STATUS_PAGE_ROOT_DOMAIN` is set —
 * `acme` is served at `acme.openmonitor.app`. Without this list the first
 * person to sign up as `app`, `api` or `mail` owns that hostname on your
 * domain, which is a phishing surface and shadows your own infrastructure.
 *
 * Page slugs become path segments on the status page, where the risk is duller
 * but still real: a page slugged `events` is simply unreachable, because Next
 * resolves the static `/events` route first.
 *
 * Deliberately one list for both. The union is small, the cost of over-blocking
 * a slug is that someone picks another word, and the cost of under-blocking is
 * a hostname you can't take back once a tenant is using it.
 */
const RESERVED = new Set([
  // Infrastructure and mail — the phishing-relevant ones.
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "cdn",
  "dashboard",
  "email",
  "ftp",
  "imap",
  "internal",
  "localhost",
  "mail",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "postmaster",
  "root",
  "smtp",
  "ssl",
  "static",
  "system",
  "vpn",
  "webmaster",
  "www",
  // Product surfaces someone could impersonate or shadow.
  "abuse",
  "account",
  "accounts",
  "billing",
  "blog",
  "checkout",
  "docs",
  "help",
  "login",
  "logout",
  "openmonitor",
  "pricing",
  "security",
  "signin",
  "signup",
  "status",
  "support",
  // Static routes on the status page, which would shadow a page slug.
  "events",
  "monitors",
  "unlock",
  // Environment names, so a staging host can't be claimed by a tenant.
  "demo",
  "dev",
  "preview",
  "prod",
  "production",
  "sandbox",
  "staging",
  "test",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}

/** For error messages and tests. */
export const RESERVED_SLUGS: readonly string[] = [...RESERVED].sort();
