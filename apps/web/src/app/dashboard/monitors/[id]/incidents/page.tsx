import { db, desc, eq, schema } from "@openmonitor/db";
import { notFound } from "next/navigation";
import { IncidentsTable } from "~/components/incidents-table";

export default async function MonitorIncidentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conn = db();
  const [monitor] = await conn
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(eq(schema.monitors.id, id))
    .limit(1);
  if (!monitor) notFound();

  const rows = await conn
    .select({
      id: schema.incidents.id,
      title: schema.incidents.title,
      status: schema.incidents.status,
      severity: schema.incidents.severity,
      startedAt: schema.incidents.startedAt,
      resolvedAt: schema.incidents.resolvedAt,
    })
    .from(schema.incidents)
    .innerJoin(schema.incidentMonitors, eq(schema.incidentMonitors.incidentId, schema.incidents.id))
    .where(eq(schema.incidentMonitors.monitorId, id))
    .orderBy(desc(schema.incidents.startedAt));

  return (
    <IncidentsTable
      rows={rows.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        startedAt: i.startedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      }))}
    />
  );
}
