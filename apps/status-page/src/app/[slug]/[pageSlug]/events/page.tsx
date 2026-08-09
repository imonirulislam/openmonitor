import { EventsPageView } from "~/components/events-page-view";

export const revalidate = 30;

export default async function WorkspaceScopedEventsPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}) {
  const { slug, pageSlug } = await params;
  return <EventsPageView workspace={slug} page={pageSlug} />;
}
