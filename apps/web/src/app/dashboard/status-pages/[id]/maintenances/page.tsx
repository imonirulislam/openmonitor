import Link from "next/link";
import { db, desc, eq, inArray, schema } from "@openmonitor/db";
import { Card } from "@openmonitor/ui";
import { MaintenanceSheet } from "~/components/maintenance-sheet";
import { MaintenancesTable } from "~/components/maintenances-table";
import { createMaintenance } from "~/lib/actions/maintenance";

export default async function MaintenancesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conn = db();

  // IDs of monitors linked to this page — used to filter the maintenances list
  // below. The create-sheet picker fetches its options from /api/monitors/search
  // scoped by statusPageId.
  // INNER JOIN on monitors filters out type='static' components (their
  // monitor_id is null); selecting monitors.id keeps it non-null in TS.
  const linked = await conn
    .select({ id: schema.monitors.id })
    .from(schema.pageComponents)
    .innerJoin(
      schema.monitors,
      eq(schema.monitors.id, schema.pageComponents.monitorId),
    )
    .where(eq(schema.pageComponents.statusPageId, id));
  const monitorIds = linked.map((l) => l.id);

  const maintenances =
    monitorIds.length > 0
      ? await conn
          .selectDistinct({
            id: schema.maintenances.id,
            title: schema.maintenances.title,
            description: schema.maintenances.description,
            status: schema.maintenances.status,
            startsAt: schema.maintenances.startsAt,
            endsAt: schema.maintenances.endsAt,
          })
          .from(schema.maintenances)
          .innerJoin(
            schema.maintenanceMonitors,
            eq(schema.maintenanceMonitors.maintenanceId, schema.maintenances.id),
          )
          .where(inArray(schema.maintenanceMonitors.monitorId, monitorIds))
          .orderBy(desc(schema.maintenances.startsAt))
          .limit(50)
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Maintenances</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            Planned outages affecting components on this page. Looking for{" "}
            <Link
              href={`/dashboard/status-pages/${id}/status-reports`}
              className="underline"
            >
              status reports
            </Link>
            ?
          </p>
        </div>
        <MaintenanceSheet action={createMaintenance} statusPageId={id} />
      </div>

      {maintenances.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No results.</Card>
      ) : (
        <MaintenancesTable
          rows={maintenances.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description ?? null,
            status: m.status,
            startsAt: m.startsAt.toISOString(),
            endsAt: m.endsAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
