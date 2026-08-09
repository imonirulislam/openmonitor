import { headers } from "next/headers";
import { MonitorsPageView } from "~/components/monitors-page-view";

export const revalidate = 30;

export default async function ScopedMonitorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <MonitorsPageView
      page={slug}
      host={host}
      monitorHref={(monitorSlug) => `/${slug}/monitors/${monitorSlug}`}
    />
  );
}
