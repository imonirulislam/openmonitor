import type { Metadata } from "next";
import { headers } from "next/headers";
import { api } from "~/lib/api";
import { StatusPageView } from "~/components/status-page-view";

export const revalidate = 30;

/**
 * Two-segment public route — `/<workspace-slug>/<page-slug>`. The first
 * segment is named `slug` here (parent dir) but interpreted as a workspace
 * slug; the second is the page slug.
 */
export default async function WorkspaceStatusPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}) {
  const { slug, pageSlug } = await params;
  return <StatusPageView workspace={slug} page={pageSlug} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
    const summary = await api().getStatus({ workspace: slug, page: pageSlug, host });
    return {
      title: summary.page.name,
      icons: summary.page.iconUrl ? { icon: summary.page.iconUrl } : undefined,
    };
  } catch {
    return {};
  }
}
