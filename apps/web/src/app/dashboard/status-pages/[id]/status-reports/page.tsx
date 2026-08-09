import Link from "next/link";
import { db, desc, eq, inArray, schema } from "@openmonitor/db";
import { Card } from "@openmonitor/ui";
import { IncidentSheet } from "~/components/incident-sheet";
import { StatusReportsTable } from "~/components/status-reports-table";
import { createIncident } from "~/lib/actions/incidents";

export default async function StatusReportsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conn = db();

  // Monitors linked to this status page; we surface incidents that affect any
  // of them. (Openstatus has a separate "status_reports" table with a hard
  // page_id link; we filter incidents instead — same outcome with one less
  // table.)
  // INNER JOIN on monitors filters out type='static' components (their
  // monitor_id is null). Select monitors.id directly so TS sees a non-null
  // string.
  // IDs of monitors linked to this page — used to filter the incidents list
  // below. The create-sheet picker fetches its options from /api/monitors/search
  // scoped by statusPageId.
  const linkedMonitors = await conn
    .select({ id: schema.monitors.id })
    .from(schema.pageComponents)
    .innerJoin(
      schema.monitors,
      eq(schema.monitors.id, schema.pageComponents.monitorId),
    )
    .where(eq(schema.pageComponents.statusPageId, id));
  const monitorIds = linkedMonitors.map((l) => l.id);

  const incidents =
    monitorIds.length > 0
      ? await conn
          .selectDistinct({
            id: schema.incidents.id,
            title: schema.incidents.title,
            status: schema.incidents.status,
            severity: schema.incidents.severity,
            startedAt: schema.incidents.startedAt,
            resolvedAt: schema.incidents.resolvedAt,
          })
          .from(schema.incidents)
          .innerJoin(
            schema.incidentMonitors,
            eq(schema.incidentMonitors.incidentId, schema.incidents.id),
          )
          .where(inArray(schema.incidentMonitors.monitorId, monitorIds))
          .orderBy(desc(schema.incidents.startedAt))
          .limit(50)
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Status reports</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            Incidents affecting components on this page. Looking for{" "}
            <Link
              href={`/dashboard/status-pages/${id}/maintenances`}
              className="underline"
            >
              maintenances
            </Link>
            ?
          </p>
        </div>
        <IncidentSheet action={createIncident} statusPageId={id} />
      </div>

      {incidents.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No results.</Card>
      ) : (
        <StatusReportsTable
          rows={incidents.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            severity: i.severity,
            startedAt: i.startedAt.toISOString(),
            resolvedAt: i.resolvedAt?.toISOString() ?? null,
          }))}
        />
      )}
    </div>
  );
}
