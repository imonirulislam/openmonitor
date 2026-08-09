import { MonitorsPageView } from "~/components/monitors-page-view";

export const revalidate = 30;

export default async function WorkspaceScopedMonitorsPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}) {
  const { slug, pageSlug } = await params;
  return (
    <MonitorsPageView
      workspace={slug}
      page={pageSlug}
      monitorHref={(monitorSlug) => `/${slug}/${pageSlug}/monitors/${monitorSlug}`}
    />
  );
}
