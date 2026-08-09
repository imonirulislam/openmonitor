import { headers } from "next/headers";
import { MonitorsPageView } from "~/components/monitors-page-view";

export const revalidate = 30;

export default async function MonitorsPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
  return (
    <MonitorsPageView
      workspace={process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE}
      page={process.env.NEXT_PUBLIC_DEFAULT_PAGE}
      host={host}
      monitorHref={(slug) => `/monitors/${slug}`}
    />
  );
}
