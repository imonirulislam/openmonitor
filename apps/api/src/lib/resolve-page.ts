import { and, db, eq, schema } from "@openmonitor/db";

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
 *      port stripped), use that.
 *   2. Else if `workspaceSlug` is set, look up by (workspace.slug, page.slug).
 *   3. Else fall back to a slug-only match — but only when exactly one page
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

  if (workspaceSlug) {
    const rows = await conn
      .select(PAGE_COLUMNS)
      .from(schema.statusPages)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.statusPages.workspaceId))
      .where(
        and(eq(schema.workspaces.slug, workspaceSlug), eq(schema.statusPages.slug, pageSlug)),
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
