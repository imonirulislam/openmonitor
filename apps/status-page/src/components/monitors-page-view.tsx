import { NotFoundError, RequiresPasswordError } from "@openmonitor/api-client";
import { SectionMetaTitle, Separator, StatusBlank } from "@openmonitor/ui";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LazyPercentileChart } from "~/components/lazy-percentile-chart";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";

const TITLE = process.env.NEXT_PUBLIC_STATUS_TITLE ?? "OpenMonitor";

/**
 * Response times for the dependencies a page chooses to publish.
 *
 * Deliberately not the component list: these are services whose speed is worth
 * showing — often third parties — and whose outage must not read as this
 * page's own. That separation lives in `page_components.surface`; the Status
 * tab renders the `status` set, this one the `metrics` set.
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

  const monitors = summary.metricMonitors;
  const series = await api().getMonitorPercentiles(
    monitors.map((m) => m.monitorSlug),
    { hours: 24, workspace, page, host, unlock },
  );
  const bySlug = new Map(series.map((s) => [s.monitor.slug, s.buckets]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{summary.page.name ?? TITLE}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Response times for the services this page publishes.
        </p>
      </header>

      <SectionMetaTitle meta="Last 24 hours">Monitors</SectionMetaTitle>
      <Separator />

      <div className="flex flex-col gap-6">
        {monitors.map((m) => (
          <Link
            key={m.id}
            href={monitorHref(m.monitorSlug)}
            className="-mx-3 -my-2 flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-sm">{m.name}</span>
              {m.description ? (
                <span className="text-muted-foreground text-xs">{m.description}</span>
              ) : null}
            </div>
            <LazyPercentileChart data={bySlug.get(m.monitorSlug) ?? []} />
          </Link>
        ))}
        {monitors.length === 0 ? (
          <StatusBlank
            title="No public monitors"
            description="No public monitors have been added to this page."
          />
        ) : null}
      </div>
    </main>
  );
}
