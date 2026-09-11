import { NotFoundError, RequiresPasswordError } from "@openmonitor/api-client";
import {
  Card,
  type FeedEvent,
  SectionMetaTitle,
  Separator,
  StatusEventFeed,
} from "@openmonitor/ui";
import { ArrowLeftIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MonitorDetail } from "~/components/monitor-detail";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";
import { LazyLatencyChart } from "./lazy-latency-chart";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

/**
 * Renders the per-monitor detail page for a given (workspace, page) pair.
 * `backHref` points at the matching monitors-list URL (root or slug-scoped).
 */
export async function MonitorDetailPageView({
  monitorSlug,
  workspace,
  page,
  host,
  backHref,
}: {
  monitorSlug: string;
  workspace?: string;
  page?: string;
  host?: string;
  backHref: string;
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

  const monitor = summary.components.find(
    (c) => c.type === "monitor" && c.monitorSlug === monitorSlug,
  );
  if (!monitor) notFound();

  const initialHistory = await api().getMonitorHistory(monitorSlug, {
    days: 90,
    workspace,
    page,
    host,
    unlock,
  });
  const latency = await api().getMonitorLatency(monitorSlug, {
    hours: 24,
    workspace,
    page,
    host,
    unlock,
  });

  const allIncidents = [...summary.incidents, ...summary.pastIncidents];
  const monitorIncidents = allIncidents.filter((i) =>
    i.affected.some((a) => a.slug === monitorSlug),
  );
  const allMaintenance = [...summary.maintenances, ...summary.pastMaintenances];
  const monitorMaintenance = allMaintenance.filter((m) =>
    m.affected.some((a) => a.slug === monitorSlug),
  );

  const events: FeedEvent[] = [
    ...monitorIncidents.map((i) => ({
      id: i.id,
      type: "incident" as const,
      title: i.title,
      date: i.resolvedAt ?? i.startedAt,
      status: i.status,
      severity: i.severity,
      affected: i.affected,
      updates: i.updates,
    })),
    ...monitorMaintenance.map((m) => ({
      id: m.id,
      type: "maintenance" as const,
      title: m.title,
      date: m.startsAt,
      endsAt: m.endsAt,
      status: m.status,
      affected: m.affected,
      description: m.description,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 font-mono text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3" /> All monitors
      </Link>

      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{monitor.name}</h1>
        {monitor.description ? (
          <p className="mt-1 text-muted-foreground text-sm">{monitor.description}</p>
        ) : null}
      </header>

      <MonitorDetail
        monitor={{
          name: monitor.name,
          slug: monitor.monitorSlug ?? monitorSlug,
          description: monitor.description,
          status: monitor.status as MonitorStatus,
        }}
        initialHistory={initialHistory}
        incidentCount={monitorIncidents.length}
        scope={{ workspace, page, host, unlock }}
      />

      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium text-sm">Latency (last 24h)</h2>
          <span className="font-mono text-muted-foreground text-[10px] uppercase tracking-wide">
            10-min buckets
          </span>
        </div>
        <div className="mt-4">
          <LazyLatencyChart data={latency.buckets} />
        </div>
      </Card>

      <section className="flex flex-col gap-4">
        <SectionMetaTitle meta={`${events.length} total`}>Related events</SectionMetaTitle>
        <Separator />
        <StatusEventFeed events={events} />
      </section>
    </main>
  );
}
