import { db, desc, inArray, schema, sql } from "@openmonitor/db";
import { SectionGroupTitle, Separator } from "@openmonitor/ui";
import { AuditLogsTable, type AuditRow } from "~/components/audit-logs-table";

const ROW_LIMIT = 2000;

const TARGET_PATH: Record<string, string> = {
  monitor: "monitors",
  incident: "incidents",
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

  // Audit rows store the uuid, but URLs address monitors by slug and incidents
  // by number. Resolve every referenced target in two batched lookups rather
  // than linking to a uuid — and leave the link off entirely when the target
  // has since been deleted, since that URL would only 404.
  const allMonitorIds = uniqueIds(logs, "monitor");
  const allIncidentIds = uniqueIds(logs, "incident");

  const monitorSlugs = allMonitorIds.length
    ? new Map(
        (
          await conn
            .select({ id: schema.monitors.id, slug: schema.monitors.slug })
            .from(schema.monitors)
            .where(inArray(schema.monitors.id, allMonitorIds))
        ).map((r) => [r.id, r.slug]),
      )
    : new Map<string, string>();

  const incidentNumbers = allIncidentIds.length
    ? new Map(
        (
          await conn
            .select({ id: schema.incidents.id, number: schema.incidents.number })
            .from(schema.incidents)
            .where(inArray(schema.incidents.id, allIncidentIds))
        ).map((r) => [r.id, String(r.number)]),
      )
    : new Map<string, string>();

  const hrefFor = (type: string, id: string | null): string | null => {
    const segment = TARGET_PATH[type];
    if (!segment || !id) return null;
    const address = type === "monitor" ? monitorSlugs.get(id) : incidentNumbers.get(id);
    return address ? `/dashboard/${segment}/${address}` : null;
  };

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    actorEmail: l.actorEmail,
    action: l.action,
    targetType: l.targetType,
    targetId: l.targetId,
    targetLabel: resolveLabel(l, monitorNames, incidentTitles),
    targetHref: hrefFor(l.targetType, l.targetId),
    metadata: l.metadata ? JSON.stringify(l.metadata) : null,
  }));

  const truncated = (totalCount ?? 0) > rows.length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <SectionGroupTitle>Audit logs</SectionGroupTitle>
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

/** Every referenced target of a type, labelled or not — links need all of them. */
function uniqueIds(rows: LogRow[], type: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.targetType === type && r.targetId) set.add(r.targetId);
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
