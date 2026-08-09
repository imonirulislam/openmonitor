import { headers } from "next/headers";
import { EventsPageView } from "~/components/events-page-view";

export const revalidate = 30;

export default async function EventsPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <EventsPageView
      workspace={process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE}
      page={process.env.NEXT_PUBLIC_DEFAULT_PAGE}
      host={host}
    />
  );
}
