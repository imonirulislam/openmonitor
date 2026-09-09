import type { Metadata } from "next";
import { headers } from "next/headers";
import { StatusPageView } from "~/components/status-page-view";
import { api } from "~/lib/api";

export const revalidate = 30;

/**
 * Default landing page. Resolution order:
 *   1. If the inbound Host matches a status_page.custom_domain, render that page.
 *   2. Otherwise fall back to NEXT_PUBLIC_DEFAULT_WORKSPACE / NEXT_PUBLIC_DEFAULT_PAGE.
 */
export default async function HomePage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <StatusPageView
      workspace={process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE}
      page={process.env.NEXT_PUBLIC_DEFAULT_PAGE}
      host={host}
    />
  );
}

/**
 * Per-page favicon override. When the resolved page has an iconUrl set,
 * Next.js writes a <link rel="icon"> into <head> with it; otherwise the
 * default icon (app/icon.svg) wins.
 *
 * The status fetch here is the same one the page itself does — Next's
 * request cache de-dupes the API hit so we don't pay twice per request.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
    const summary = await api().getStatus({
      workspace: process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE,
      page: process.env.NEXT_PUBLIC_DEFAULT_PAGE,
      host,
    });
    return {
      title: summary.page.name,
      icons: summary.page.iconUrl ? { icon: summary.page.iconUrl } : undefined,
    };
  } catch {
    // Page might be password-protected (401) or unreachable — let the layout
    // defaults take over. The page itself handles the unlock redirect.
    return {};
  }
}
