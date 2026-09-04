import { countRunsFor, recentRuns } from "@openmonitor/clickhouse";
import { db, eq, schema } from "@openmonitor/db";
import { notFound } from "next/navigation";
import { MonitorLogsTable } from "~/components/monitor-logs-table";
import { monitorIdFrom } from "~/lib/resolve-entity";
import { getCurrentWorkspaceId } from "~/lib/workspace";

// How many probes to ship to the client. Sized to comfortably hold ~24h of
// probes for a 60s monitor (1,440 rows) with headroom. For longer windows,
// move to server-side pagination — see CLAUDE.md note.
const ROW_LIMIT = 2000;

export default async function MonitorLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const id = await monitorIdFrom(idOrSlug, workspaceId);
  const conn = db();
  const [monitor] = await conn
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(eq(schema.monitors.id, id))
    .limit(1);
  if (!monitor) notFound();

  const [totalCount, runs] = await Promise.all([countRunsFor(id), recentRuns(id, ROW_LIMIT)]);

  const truncated = (totalCount ?? 0) > runs.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Showing the latest <span className="font-mono">{runs.length.toLocaleString()}</span> of{" "}
        <span className="font-mono">{(totalCount ?? 0).toLocaleString()}</span> probe results.
        {truncated ? " Older entries omitted." : null}
      </p>
      {/* recentRuns already returns the table's row shape. */}
      <MonitorLogsTable rows={runs} />
    </div>
  );
}
