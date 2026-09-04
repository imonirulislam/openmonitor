import { and, type db, eq, schema } from "@openmonitor/db";
import { env } from "../env";

/**
 * Pull the workspace slug out of `<workspace>.<root-domain>`.
 *
 * Returns null for the apex, for `www`, for any host outside the configured
 * root, and when STATUS_PAGE_ROOT_DOMAIN is unset — so a single-tenant
 * self-host, which has no wildcard DNS, behaves exactly as before.
 *
 * Deliberately only the first label: `a.b.openmonitor.app` is not a workspace.
 * Wildcard certificates cover one level, so anything deeper can't have been
 * served over TLS by us anyway.
 */
export function workspaceSlugFromHost(host: string | undefined): string | null {
  const root = env.STATUS_PAGE_ROOT_DOMAIN?.toLowerCase();
  if (!root || !host) return null;

  const normalized = host.toLowerCase().split(":")[0];
  if (!normalized || !normalized.endsWith(`.${root}`)) return null;

  const label = normalized.slice(0, -(root.length + 1));
  if (!label || label === "www" || label.includes(".")) return null;
  return label;
}

const PAGE_COLUMNS = {
  id: schema.statusPages.id,
  slug: schema.statusPages.slug,
  name: schema.statusPages.name,
  workspaceId: schema.statusPages.workspaceId,
  isPublic: schema.statusPages.isPublic,
  logoUrl: schema.statusPages.logoUrl,
  iconUrl: schema.statusPages.iconUrl,
  primaryColor: schema.statusPages.primaryColor,
  customCss: schema.statusPages.customCss,
  homepageUrl: schema.statusPages.homepageUrl,
  contactUrl: schema.statusPages.contactUrl,
  passwordHash: schema.statusPages.passwordHash,
} as const;

/**
 * Look up a status page using the standard public-API resolution order:
 *
 *   1. If `host` matches a `status_pages.custom_domain` (case-insensitive,
 *      port stripped), use that. A customer's own domain always wins.
 *   2. Else if `host` is `<workspace>.STATUS_PAGE_ROOT_DOMAIN`, resolve within
 *      that workspace — and only that workspace. If the page isn't there this
 *      returns null rather than falling through, so a tenant's subdomain can
 *      never render another tenant's page.
 *   3. Else if `workspaceSlug` is set, look up by (workspace.slug, page.slug).
 *   4. Else fall back to a slug-only match — but only when exactly one page
 *      with that slug exists across all workspaces. (Two matches = ambiguous,
 *      caller should disambiguate via workspace slug.)
 *
 * Used by /v1/status, /v1/monitors/:slug/history, /v1/monitors/:slug/latency,
 * /v1/monitors/:slug/badge.svg, /v1/status-pages/:pageSlug/badge.svg, and the
 * RSS feed endpoint.
 */
export async function resolveStatusPage(
  conn: ReturnType<typeof db>,
  workspaceSlug: string | undefined,
  pageSlug: string,
  host?: string,
) {
  if (host) {
    const normalized = host.toLowerCase().split(":")[0];
    if (normalized) {
      const rows = await conn
        .select(PAGE_COLUMNS)
        .from(schema.statusPages)
        .where(eq(schema.statusPages.customDomain, normalized))
        .limit(1);
      if (rows[0]) return rows[0];
    }
  }

  // A subdomain pins the workspace. It overrides an explicit `workspaceSlug`
  // rather than deferring to it: the whole reason to give each tenant a host is
  // that content served there is theirs, and honouring a path parameter that
  // disagreed would hand that back.
  const hostWorkspace = workspaceSlugFromHost(host);
  const scopedWorkspace = hostWorkspace ?? workspaceSlug;

  if (scopedWorkspace) {
    const rows = await conn
      .select(PAGE_COLUMNS)
      .from(schema.statusPages)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.statusPages.workspaceId))
      .where(
        and(eq(schema.workspaces.slug, scopedWorkspace), eq(schema.statusPages.slug, pageSlug)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  const rows = await conn
    .select(PAGE_COLUMNS)
    .from(schema.statusPages)
    .where(eq(schema.statusPages.slug, pageSlug))
    .limit(2);
  if (rows.length !== 1) return null;
  return rows[0] ?? null;
}
