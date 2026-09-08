import { and, type db, eq, isReservedSlug, schema } from "@openmonitor/db";
import { env } from "../env";

/**
 * Pull the status page slug out of `<page>.<root-domain>`.
 *
 * Returns null for the apex, for reserved labels, for any host outside the
 * configured root, and when STATUS_PAGE_ROOT_DOMAIN is unset — so a
 * single-tenant self-host, which has no wildcard DNS, behaves as before.
 *
 * Only the first label: `a.b.openmonitor.app` is not a page. Wildcard
 * certificates cover one level, so anything deeper wasn't served by us.
 */
export function pageSlugFromHost(host: string | undefined): string | null {
  const root = env.STATUS_PAGE_ROOT_DOMAIN?.toLowerCase();
  if (!root || !host) return null;

  const normalized = host.toLowerCase().split(":")[0];
  if (!normalized || !normalized.endsWith(`.${root}`)) return null;

  const label = normalized.slice(0, -(root.length + 1));
  if (!label || label.includes(".")) return null;

  // status.example.com is the site's own host, not a tenant's page. Page
  // creation rejects these slugs, so reading one as a page only 404s it.
  if (isReservedSlug(label)) return null;

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
 * Look up a status page, in order:
 *
 *   1. `host` matches a `status_pages.custom_domain` — a customer's own domain
 *      always wins.
 *   2. `host` is `<page>.STATUS_PAGE_ROOT_DOMAIN` — resolve that page. The slug
 *      is globally unique, so no workspace is needed to disambiguate.
 *   3. `workspaceSlug` is set — look up by (workspace.slug, page.slug).
 *   4. Otherwise by page slug alone.
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

  // A subdomain names the page outright, and overrides `?workspace=`/`?page=`:
  // the point of giving a page its own host is that what's served there is that
  // page, not whatever a query parameter asks for.
  const hostPage = pageSlugFromHost(host);
  if (hostPage) {
    const rows = await conn
      .select(PAGE_COLUMNS)
      .from(schema.statusPages)
      .where(eq(schema.statusPages.slug, hostPage))
      .limit(1);
    return rows[0] ?? null;
  }

  if (workspaceSlug) {
    const rows = await conn
      .select(PAGE_COLUMNS)
      .from(schema.statusPages)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.statusPages.workspaceId))
      .where(and(eq(schema.workspaces.slug, workspaceSlug), eq(schema.statusPages.slug, pageSlug)))
      .limit(1);
    return rows[0] ?? null;
  }

  const rows = await conn
    .select(PAGE_COLUMNS)
    .from(schema.statusPages)
    .where(eq(schema.statusPages.slug, pageSlug))
    .limit(1);
  return rows[0] ?? null;
}
