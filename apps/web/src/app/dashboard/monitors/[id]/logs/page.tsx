import { notFound } from "next/navigation";
import { db, desc, eq, schema, sql } from "@openmonitor/db";
import { MonitorLogsTable } from "~/components/monitor-logs-table";

// How many probes to ship to the client. Sized to comfortably hold ~24h of
// probes for a 60s monitor (1,440 rows) with headroom. For longer windows,
// move to server-side pagination — see CLAUDE.md note.
const ROW_LIMIT = 2000;

export default async function MonitorLogsPage({
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

  const [countRow] = await conn
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(schema.monitorRuns)
    .where(eq(schema.monitorRuns.monitorId, id));
  const totalCount = countRow?.totalCount ?? 0;

  const runs = await conn
    .select()
    .from(schema.monitorRuns)
    .where(eq(schema.monitorRuns.monitorId, id))
    .orderBy(desc(schema.monitorRuns.checkedAt))
    .limit(ROW_LIMIT);

  const truncated = (totalCount ?? 0) > runs.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Showing the latest <span className="font-mono">{runs.length.toLocaleString()}</span> of{" "}
        <span className="font-mono">{(totalCount ?? 0).toLocaleString()}</span> probe results.
        {truncated ? " Older entries omitted." : null}
      </p>
      <MonitorLogsTable
        rows={runs.map((r) => ({
          id: r.id,
          checkedAt: r.checkedAt.toISOString(),
          status: r.status,
          statusCode: r.statusCode,
          latencyMs: r.latencyMs,
          region: r.region,
          error: r.error,
          dns: r.latencyDnsMs,
          connect: r.latencyConnectMs,
          tls: r.latencyTlsMs,
          ttfb: r.latencyTtfbMs,
          transfer: r.latencyTransferMs,
        }))}
      />
    </div>
  );
}
