import { and, db, desc, eq, gte, schema } from "@openmonitor/db";
import { SectionMetaTitle, Separator } from "@openmonitor/ui";
import { ActivityIcon, HeartPulseIcon, PanelTopIcon, WrenchIcon, ZapIcon } from "lucide-react";
import { OverviewStatCard } from "~/components/overview-cards";
import { RecentIncidentsPanel, RecentMaintenancePanel } from "~/components/overview-panels";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function OverviewPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Counts for the top stat row.
  const monitorRows = await conn
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, workspaceId));
  const statusPageRows = await conn
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(eq(schema.statusPages.workspaceId, workspaceId));
  const heartbeatRows = await conn
    .select({ id: schema.heartbeatMonitors.id })
    .from(schema.heartbeatMonitors)
    .where(eq(schema.heartbeatMonitors.workspaceId, workspaceId));

  // Most-recent incident and maintenance (any age) for the relative-time
  // stat cards. Keep separate from the "last 7d" lists below.
  const [latestIncident] = await conn
    .select({ startedAt: schema.incidents.startedAt })
    .from(schema.incidents)
    .where(eq(schema.incidents.workspaceId, workspaceId))
    .orderBy(desc(schema.incidents.startedAt))
    .limit(1);
  const [latestMaintenance] = await conn
    .select({ startsAt: schema.maintenances.startsAt })
    .from(schema.maintenances)
    .where(eq(schema.maintenances.workspaceId, workspaceId))
    .orderBy(desc(schema.maintenances.startsAt))
    .limit(1);

  // Last-7d lists for the two sections below.
  const recentIncidents = await conn
    .select()
    .from(schema.incidents)
    .where(
      and(eq(schema.incidents.workspaceId, workspaceId), gte(schema.incidents.startedAt, since7d)),
    )
    .orderBy(desc(schema.incidents.startedAt))
    .limit(10);

  const recentMaintenance = await conn
    .select()
    .from(schema.maintenances)
    .where(
      and(
        eq(schema.maintenances.workspaceId, workspaceId),
        gte(schema.maintenances.startsAt, since7d),
      ),
    )
    .orderBy(desc(schema.maintenances.startsAt))
    .limit(10);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm">Welcome to your dashboard.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <OverviewStatCard
          label="Monitors"
          value={monitorRows.length.toString()}
          icon={ActivityIcon}
          href="/dashboard/monitors"
        />
        <OverviewStatCard
          label="Status Pages"
          value={statusPageRows.length.toString()}
          icon={PanelTopIcon}
          href="/dashboard/status-pages"
        />
        <OverviewStatCard
          label="Heartbeats"
          value={heartbeatRows.length.toString()}
          icon={HeartPulseIcon}
          href="/dashboard/heartbeats"
        />
        <OverviewStatCard
          label="Last Incident"
          relativeTo={latestIncident?.startedAt ?? null}
          icon={ZapIcon}
          href="/dashboard/incidents"
        />
        <OverviewStatCard
          label="Last Maintenance"
          relativeTo={latestMaintenance?.startsAt ?? null}
          icon={WrenchIcon}
          href="/dashboard/maintenance"
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionMetaTitle meta="Last 7 days">Incidents</SectionMetaTitle>
        <Separator />
        <RecentIncidentsPanel rows={recentIncidents} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionMetaTitle meta="Last 7 days">Maintenance</SectionMetaTitle>
        <Separator />
        <RecentMaintenancePanel rows={recentMaintenance} />
      </section>
    </div>
  );
}
