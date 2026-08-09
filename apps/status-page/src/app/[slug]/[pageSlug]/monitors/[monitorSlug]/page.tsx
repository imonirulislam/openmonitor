import { MonitorDetailPageView } from "~/components/monitor-detail-page-view";

export const revalidate = 30;

export default async function WorkspaceScopedMonitorDetailPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string; monitorSlug: string }>;
}) {
  const { slug, pageSlug, monitorSlug } = await params;
  return (
    <MonitorDetailPageView
      monitorSlug={monitorSlug}
      workspace={slug}
      page={pageSlug}
      backHref={`/${slug}/${pageSlug}/monitors`}
    />
  );
}
