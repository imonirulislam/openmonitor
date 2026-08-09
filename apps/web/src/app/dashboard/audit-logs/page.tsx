import { db, desc, inArray, schema, sql } from "@openmonitor/db";
import { Separator } from "@openmonitor/ui";
import { AuditLogsTable, type AuditRow } from "~/components/audit-logs-table";

const ROW_LIMIT = 2000;

const TARGET_HREF: Record<string, (id: string) => string> = {
  monitor: (id) => `/dashboard/monitors/${id}`,
  incident: (id) => `/dashboard/incidents/${id}`,
};

export default async function AuditLogsPage() {
  const conn = db();

  const [countRow] = await conn
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(schema.auditLogs);
  const totalCount = countRow?.totalCount ?? 0;

  const logs = await conn
    .select()
    .from(schema.auditLogs)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(ROW_LIMIT);

  // Resolve current names for any rows where targetLabel is null. Two batched
  // lookups per target type so the page stays a single SQL round-trip per
  // type regardless of how many rows are missing labels.
  const monitorIdsToLookup = uniqueMissingIds(logs, "monitor");
  const incidentIdsToLookup = uniqueMissingIds(logs, "incident");

  const monitorNames = monitorIdsToLookup.length
    ? new Map(
        (
          await conn
            .select({ id: schema.monitors.id, name: schema.monitors.name })
            .from(schema.monitors)
            .where(inArray(schema.monitors.id, monitorIdsToLookup))
        ).map((r) => [r.id, r.name]),
      )
    : new Map<string, string>();

  const incidentTitles = incidentIdsToLookup.length
    ? new Map(
        (
          await conn
            .select({ id: schema.incidents.id, title: schema.incidents.title })
            .from(schema.incidents)
            .where(inArray(schema.incidents.id, incidentIdsToLookup))
        ).map((r) => [r.id, r.title]),
      )
    : new Map<string, string>();

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    actorEmail: l.actorEmail,
    action: l.action,
    targetType: l.targetType,
    targetId: l.targetId,
    targetLabel: resolveLabel(l, monitorNames, incidentTitles),
    targetHref:
      l.targetId && TARGET_HREF[l.targetType] ? TARGET_HREF[l.targetType]!(l.targetId) : null,
    metadata: l.metadata ? JSON.stringify(l.metadata) : null,
  }));

  const truncated = (totalCount ?? 0) > rows.length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Audit logs</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          All admin actions, immutable. Most recent first. Showing the latest{" "}
          <span className="font-mono">{rows.length.toLocaleString()}</span> of{" "}
          <span className="font-mono">{(totalCount ?? 0).toLocaleString()}</span>.
          {truncated ? " Older entries omitted." : null}
        </p>
      </header>

      <Separator />

      <AuditLogsTable rows={rows} />
    </div>
  );
}

type LogRow = typeof schema.auditLogs.$inferSelect;

function uniqueMissingIds(rows: LogRow[], type: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.targetType === type && r.targetId && !r.targetLabel) set.add(r.targetId);
  }
  return [...set];
}

function resolveLabel(
  row: LogRow,
  monitorNames: Map<string, string>,
  incidentTitles: Map<string, string>,
): string {
  if (row.targetLabel) return row.targetLabel;
  if (row.targetId) {
    if (row.targetType === "monitor") {
      const name = monitorNames.get(row.targetId);
      if (name) return name;
    }
    if (row.targetType === "incident") {
      const title = incidentTitles.get(row.targetId);
      if (title) return title;
    }
    return `${row.targetId.slice(0, 8)}…`;
  }
  return "—";
}
