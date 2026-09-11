import { headers } from "next/headers";
import { api } from "./api";

const FALLBACK = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";

export type PageIdentity = {
  title: string;
  logoUrl?: string | null;
  host?: string;
  contactUrl?: string | null;
  homepageUrl?: string | null;
};

/**
 * The page the header and footer should name, resolved from the inbound host.
 *
 * Host-based only: the root layout has no route params, so a path-routed page
 * (status.example.com/acme) still shows the deployment title. Subdomains and
 * custom domains — what tenants actually get — resolve correctly.
 *
 * The same fetch runs in the page itself; Next's request cache de-dupes it.
 */
export async function pageIdentity(): Promise<PageIdentity> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  try {
    const summary = await api().getStatus({ host });
    return {
      title: summary.page.name || FALLBACK,
      logoUrl: summary.page.logoUrl,
      host,
      contactUrl: summary.page.contactUrl,
      homepageUrl: summary.page.homepageUrl,
    };
  } catch {
    // Password-protected, unreachable, or no page for this host. The chrome
    // still has to render.
    return { title: FALLBACK, host };
  }
}
