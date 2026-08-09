import { headers } from "next/headers";
import { EventsPageView } from "~/components/events-page-view";

export const revalidate = 30;

export default async function ScopedEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return <EventsPageView page={slug} host={host} />;
}
