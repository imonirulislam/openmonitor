import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NotFoundError, RequiresPasswordError } from "@openmonitor/api-client";
import { SectionMetaTitle, Separator } from "@openmonitor/ui";
import { MonitorListRow } from "~/components/monitor-list-row";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";

const TITLE = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

/**
 * Renders the monitors-list tab body for a given (workspace, page) pair, with
 * per-monitor links that resolve via `monitorHref` to the right detail route
 * (root or slug-scoped).
 */
export async function MonitorsPageView({
  workspace,
  page,
  host,
  monitorHref,
}: {
  workspace?: string;
  page?: string;
  host?: string;
  monitorHref: (slug: string) => string;
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

  const monitorComponents = summary.components.filter(
    (c) => c.type === "monitor" && c.monitorSlug !== null,
  );
  const histories = await Promise.all(
    monitorComponents.map((c) =>
      api().getMonitorHistory(c.monitorSlug!, { days: 90, workspace, page, host, unlock }),
    ),
  );

  const incidentCountBySlug = new Map<string, number>();
  for (const i of [...summary.incidents, ...summary.pastIncidents]) {
    for (const a of i.affected) {
      incidentCountBySlug.set(a.slug, (incidentCountBySlug.get(a.slug) ?? 0) + 1);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{summary.page.name ?? TITLE}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {monitorComponents.length} monitored{" "}
          {monitorComponents.length === 1 ? "service" : "services"}.
        </p>
      </header>

      <SectionMetaTitle meta="Last 90 days">All monitors</SectionMetaTitle>
      <Separator />

      <div className="flex flex-col gap-4">
        {monitorComponents.map((c, idx) => {
          const initialHistory = histories[idx];
          if (!initialHistory) return null;
          return (
            <MonitorListRow
              key={c.id}
              monitor={{
                id: c.id,
                slug: c.monitorSlug!,
                name: c.name,
                description: c.description,
                status: c.status as MonitorStatus,
              }}
              initialHistory={initialHistory}
              incidentCount={incidentCountBySlug.get(c.monitorSlug!) ?? 0}
              href={monitorHref(c.monitorSlug!)}
            />
          );
        })}
        {monitorComponents.length === 0 ? (
          <p className="text-muted-foreground text-sm">No monitors configured.</p>
        ) : null}
      </div>
    </main>
  );
}
