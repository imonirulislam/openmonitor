import {
  type MonitorHistory,
  NotFoundError,
  RequiresPasswordError,
  type StatusComponent,
  type StatusComponentGroup,
} from "@openmonitor/api-client";
import {
  type FeedEvent,
  SectionMetaTitle,
  Separator,
  Status,
  StatusContent,
  StatusDescription,
  StatusEventBanner,
  StatusEventFeed,
  StatusHeader,
  StatusIcon,
  StatusMonitor,
  StatusMonitorHeader,
  StatusTitle,
  type StatusVariant,
} from "@openmonitor/ui";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MonitorRow } from "~/components/monitor-row";
import { api } from "~/lib/api";
import { unlockCookieName } from "~/lib/unlock-cookie";

const DESCRIPTION = process.env.NEXT_PUBLIC_STATUS_DESCRIPTION ?? "Live status for your services";

type ComponentStatus = "up" | "down" | "degraded" | "unknown";

/**
 * Renders the status page body for a given (workspace, page) pair.
 * `/` and `/[workspaceSlug]/[pageSlug]` both call this with different args.
 */
export async function StatusPageView({
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

  // Only monitor-typed components have a per-day uptime history. Static ones
  // are admin-toggled snapshots — render them without the 90-day tracker.
  const monitorComponents = summary.components.filter(
    (c): c is StatusComponent & { monitorSlug: string } =>
      c.type === "monitor" && c.monitorSlug !== null,
  );
  const histories = await Promise.all(
    monitorComponents.map((c) =>
      api().getMonitorHistory(c.monitorSlug, { days: 90, workspace, page, host, unlock }),
    ),
  );
  const historyBySlug = new Map<string, MonitorHistory>();
  for (let i = 0; i < monitorComponents.length; i++) {
    historyBySlug.set(monitorComponents[i]!.monitorSlug, histories[i]!);
  }

  const overall = computeOverall(summary.components.map((c) => c.status));
  const variant = toStatusVariant(overall);
  const headline = overallHeadline(overall);
  const subline = overallSubline(overall, summary.incidents.length);

  const feedEvents: FeedEvent[] = [
    ...summary.pastIncidents.map((i) => ({
      id: i.id,
      type: "incident" as const,
      title: i.title,
      date: i.resolvedAt ?? i.startedAt,
      status: i.status,
      severity: i.severity,
      affected: i.affected,
      updates: i.updates,
    })),
    ...summary.pastMaintenances.map((m) => ({
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

  // Split components into ungrouped + per-group buckets, preserving the
  // server's `position` ordering.
  const ungrouped = summary.components.filter((c) => c.groupId === null);
  const byGroupId = new Map<string, StatusComponent[]>();
  for (const c of summary.components) {
    if (c.groupId === null) continue;
    const list = byGroupId.get(c.groupId) ?? [];
    list.push(c);
    byGroupId.set(c.groupId, list);
  }

  const renderRow = (c: StatusComponent) => {
    if (c.type === "monitor" && c.monitorSlug) {
      const history = historyBySlug.get(c.monitorSlug);
      if (!history) return null;
      return (
        <MonitorRow
          key={c.id}
          monitor={{
            id: c.id,
            slug: c.monitorSlug,
            name: c.name,
            description: c.description,
            status: c.status as ComponentStatus,
          }}
          initialHistory={history}
        />
      );
    }
    // Static component — same chrome as MonitorRow but no tracker.
    return (
      <StatusMonitor key={c.id}>
        <StatusMonitorHeader name={c.name} description={c.description} status={c.status} />
      </StatusMonitor>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10 sm:py-14">
      <BrandingHead branding={summary.page} />
      {summary.page.logoUrl ? (
        <PageLogo
          name={summary.page.name}
          logoUrl={summary.page.logoUrl}
          homepageUrl={summary.page.homepageUrl}
        />
      ) : null}

      <Status variant={variant}>
        <StatusHeader>
          <StatusIcon />
          <div className="flex flex-col gap-0.5">
            <StatusTitle>{headline}</StatusTitle>
            <StatusDescription>{subline}</StatusDescription>
          </div>
        </StatusHeader>

        {summary.incidents.length > 0 || summary.maintenances.length > 0 ? (
          <StatusContent>
            {summary.incidents.map((i) => (
              <StatusEventBanner
                key={i.id}
                variant="incident"
                title={i.title}
                status={i.status}
                severity={i.severity}
                startedAt={i.startedAt}
                resolvedAt={i.resolvedAt}
                updates={i.updates}
                affected={i.affected}
              />
            ))}
            {summary.maintenances.map((m) => (
              <StatusEventBanner
                key={m.id}
                variant="maintenance"
                title={m.title}
                startedAt={m.startsAt}
                resolvedAt={m.endsAt}
                status={m.status}
                affected={m.affected}
              />
            ))}
          </StatusContent>
        ) : null}
      </Status>

      <section className="flex flex-col gap-3">
        <SectionMetaTitle meta="Last 90 days">Components</SectionMetaTitle>
        <Separator />
        <div className="flex flex-col gap-4">
          {ungrouped.map(renderRow)}

          {summary.componentGroups.map((g) => {
            const items = byGroupId.get(g.id) ?? [];
            const groupStatus = computeOverall(items.map((c) => c.status));
            return (
              <ComponentGroup key={g.id} group={g} aggregateStatus={groupStatus}>
                <div className="flex flex-col gap-4">{items.map(renderRow)}</div>
              </ComponentGroup>
            );
          })}

          {summary.components.length === 0 ? (
            <p className="text-muted-foreground text-sm">No components configured yet.</p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionMetaTitle meta="Last 30 days">Recent events</SectionMetaTitle>
        <Separator />
        <StatusEventFeed events={feedEvents} />
      </section>

      {summary.page.contactUrl ? (
        <footer className="border-t border-border pt-4 text-center">
          <a
            href={summary.page.contactUrl}
            className="font-mono text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
          >
            Contact
          </a>
        </footer>
      ) : null}
    </main>
  );
}

/**
 * Renders the page logo + name. When `homepageUrl` is set, the whole block is
 * wrapped in an external link.
 */
function PageLogo({
  name,
  logoUrl,
  homepageUrl,
}: {
  name: string;
  logoUrl: string;
  homepageUrl: string | null;
}) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={`${name} logo`} className="h-8 w-auto" />
      <span className="font-semibold text-lg tracking-tight">{name}</span>
    </>
  );
  if (homepageUrl) {
    return (
      <a
        href={homepageUrl}
        className="flex items-center gap-3 hover:opacity-80"
        target="_blank"
        rel="noreferrer"
      >
        {inner}
      </a>
    );
  }
  return <div className="flex items-center gap-3">{inner}</div>;
}

const GROUP_STATUS_LABEL: Record<ComponentStatus, string> = {
  up: "Operational",
  degraded: "Degraded",
  down: "Downtime",
  unknown: "Unknown",
};

const GROUP_STATUS_COLOR: Record<ComponentStatus, string> = {
  up: "text-success",
  degraded: "text-warning",
  down: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * Collapsible group wrapper. Uses native <details>/<summary> so the initial
 * state is driven by `defaultOpen` without any client JS. The header shows
 * an aggregate status label (Operational / Degraded / Downtime) on the right,
 * computed from the worst case across the group's components.
 */
function ComponentGroup({
  group,
  aggregateStatus,
  children,
}: {
  group: StatusComponentGroup;
  aggregateStatus: ComponentStatus;
  children: React.ReactNode;
}) {
  return (
    <details open={group.defaultOpen} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 font-medium text-sm [&::-webkit-details-marker]:hidden">
        <span>{group.name}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm leading-none ${GROUP_STATUS_COLOR[aggregateStatus]}`}>
            {GROUP_STATUS_LABEL[aggregateStatus]}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-transform group-open:rotate-180">
            ▼
          </span>
        </div>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

/**
 * Inline <style> with branding overrides. CSS is admin-set, not user input,
 * so we don't sanitize.
 */
function BrandingHead({
  branding,
}: {
  branding: { primaryColor: string | null; customCss: string | null };
}) {
  const primaryRule = branding.primaryColor
    ? `:root { --color-primary: ${branding.primaryColor}; --color-accent: ${branding.primaryColor}; }`
    : "";
  const css = [primaryRule, branding.customCss ?? ""].filter(Boolean).join("\n");
  if (!css) return null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted admin input
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

function computeOverall(statuses: ComponentStatus[]): ComponentStatus {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "up")) return "up";
  return "unknown";
}

function toStatusVariant(s: ComponentStatus): StatusVariant {
  if (s === "up") return "success";
  if (s === "degraded") return "degraded";
  if (s === "down") return "error";
  return "info";
}

function overallHeadline(s: ComponentStatus): string {
  switch (s) {
    case "up":
      return "All systems operational";
    case "degraded":
      return "Some services are degraded";
    case "down":
      return "Active outage";
    default:
      return "Status unknown";
  }
}

function overallSubline(s: ComponentStatus, incidentCount: number): string {
  if (s === "up") return DESCRIPTION;
  if (incidentCount === 0) return "We're investigating.";
  return `${incidentCount} active ${incidentCount === 1 ? "incident" : "incidents"}.`;
}
