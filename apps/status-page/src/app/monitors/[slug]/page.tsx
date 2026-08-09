import { headers } from "next/headers";
import { MonitorDetailPageView } from "~/components/monitor-detail-page-view";

export const revalidate = 30;

export default async function MonitorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <MonitorDetailPageView
      monitorSlug={slug}
      workspace={process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE}
      page={process.env.NEXT_PUBLIC_DEFAULT_PAGE}
      host={host}
      backHref="/monitors"
    />
  );
}
