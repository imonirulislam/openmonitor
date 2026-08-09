import type { Metadata } from "next";
import { headers } from "next/headers";
import { StatusPageView } from "~/components/status-page-view";
import { api } from "~/lib/api";

export const revalidate = 30;

/**
 * Single-segment public route — `/<page-slug>`. Slug-only lookup against the
 * API; resolver returns 404 only when no page (or more than one across
 * workspaces) matches the slug. Static routes (`/events`, `/monitors`,
 * `/unlock`) take precedence in Next routing, so they keep working.
 *
 * The directory is named `[slug]` (not `[pageSlug]`) so it can host the
 * two-segment `[slug]/[pageSlug]/page.tsx` underneath without Next's "two
 * different dynamic param names at the same level" rule kicking in.
 */
export default async function PageBySlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return <StatusPageView page={slug} host={host} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
    const summary = await api().getStatus({ page: slug, host });
    return {
      title: summary.page.name,
      icons: summary.page.iconUrl ? { icon: summary.page.iconUrl } : undefined,
    };
  } catch {
    return {};
  }
}
