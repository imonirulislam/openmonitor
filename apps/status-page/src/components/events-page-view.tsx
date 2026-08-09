import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NotFoundError, RequiresPasswordError } from "@openmonitor/api-client";
import type { FeedEvent } from "@openmonitor/ui";
import { EventsTabs } from "~/components/events-tabs";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";

const TITLE = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";
const DESCRIPTION =
  process.env.NEXT_PUBLIC_STATUS_DESCRIPTION ?? "Live status for your services";

/**
 * Renders the events tab body for a given (workspace, page) pair. Both the
 * root `/events` and the slug-scoped `/[slug]/events` (and two-segment
 * variant) call this with different args.
 */
export async function EventsPageView({
  workspace,
  page,
  host,
}: {
  workspace?: string;
  page?: string;
  host?: string;
}) {
  const cookieStore = await cookies();
  const unlock = cookieStore.get(unlockCookieName({ workspace, page, host }))?.value;

  let summary;
  try {
    summary = await api().getStatus({ workspace, page, host, unlock });
  } catch (err) {
    if (err instanceof RequiresPasswordError) {
      const params = new URLSearchParams();
      if (workspace) params.set("workspace", workspace);
      if (page) params.set("page", page);
      redirect(`/unlock?${params.toString()}`);
    }
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const reports: FeedEvent[] = [...summary.incidents, ...summary.pastIncidents]
    .map((i) => ({
      id: i.id,
      type: "incident" as const,
      title: i.title,
      date: i.resolvedAt ?? i.startedAt,
      status: i.status,
      severity: i.severity,
      affected: i.affected,
      updates: i.updates,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const maintenances: FeedEvent[] = [...summary.maintenances, ...summary.pastMaintenances]
    .map((m) => ({
      id: m.id,
      type: "maintenance" as const,
      title: m.title,
      date: m.startsAt,
      endsAt: m.endsAt,
      status: m.status,
      affected: m.affected,
      description: m.description,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-1 text-center sm:text-left">
        <h1 className="font-semibold text-2xl tracking-tight">{summary.page.name ?? TITLE}</h1>
        <p className="text-muted-foreground text-sm">{DESCRIPTION}</p>
      </header>

      <EventsTabs reports={reports} maintenances={maintenances} />
    </main>
  );
}
