const BASE = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";

/**
 * Where a status page is publicly served.
 *
 * Subdomain form, matching how apps/api resolves an inbound host. A custom
 * domain wins; localhost falls back to the path form because dev has no
 * wildcard DNS.
 */
export function publicPageUrl(page: { slug: string; customDomain?: string | null }): string {
  if (page.customDomain) return `https://${page.customDomain}`;

  const url = new URL(BASE);
  if (url.hostname === "localhost" || /^[\d.]+$/.test(url.hostname)) {
    return `${BASE.replace(/\/$/, "")}/${page.slug}`;
  }
  url.hostname = `${page.slug}.${url.hostname}`;
  return url.toString().replace(/\/$/, "");
}
