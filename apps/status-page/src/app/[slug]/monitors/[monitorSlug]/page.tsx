import { headers } from "next/headers";
import { MonitorDetailPageView } from "~/components/monitor-detail-page-view";

export const revalidate = 30;

export default async function ScopedMonitorDetailPage({
  params,
}: {
  params: Promise<{ slug: string; monitorSlug: string }>;
}) {
  const { slug, monitorSlug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <MonitorDetailPageView
      monitorSlug={monitorSlug}
      page={slug}
      host={host}
      backHref={`/${slug}/monitors`}
    />
  );
}
