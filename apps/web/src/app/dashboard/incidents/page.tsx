import { Separator } from "@openmonitor/ui";
import { db, desc, eq, schema } from "@openmonitor/db";
import { IncidentsTable } from "~/components/incidents-table";
import { getCurrentWorkspaceId } from "~/lib/workspace";

/**
 * Workspace-wide incident browse view. Creation happens on a per-status-page
 * basis from /dashboard/status-pages/[id]/status-reports — this page is
 * read-only and intentionally not in the sidebar.
 */
export default async function IncidentsPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const incidents = await db()
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.workspaceId, workspaceId))
    .orderBy(desc(schema.incidents.startedAt))
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Incidents</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Workspace-wide view. Open new reports from a status page's Status Reports tab.
        </p>
      </header>

      <Separator />

      <IncidentsTable
        rows={incidents.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          severity: i.severity,
          startedAt: i.startedAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
