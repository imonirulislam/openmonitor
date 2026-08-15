import { asc, db, eq, isNull, or, schema } from "@openmonitor/db";
import { MonitorConfigForm, type ProbeLocationChoice } from "~/components/monitor-config-form";
import { createMonitor } from "~/lib/actions/monitors";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function NewMonitorPage() {
  const workspaceId = await getCurrentWorkspaceId();

  // Shared locations are the operator's fleet and offered to every workspace;
  // private ones belong to this workspace only.
  const locations = await db()
    .select({
      id: schema.probeLocations.id,
      name: schema.probeLocations.name,
      region: schema.probeLocations.region,
      workspaceId: schema.probeLocations.workspaceId,
    })
    .from(schema.probeLocations)
    .where(
      or(
        isNull(schema.probeLocations.workspaceId),
        eq(schema.probeLocations.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(schema.probeLocations.region));

  const probeLocations: ProbeLocationChoice[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    region: l.region,
    shared: l.workspaceId === null,
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-semibold text-xl tracking-tight">New monitor</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Configure what to probe and where to probe it from. Response time and schedule are set on
          the monitor once created.
        </p>
      </header>
      <MonitorConfigForm
        mode="create"
        action={createMonitor}
        probeLocations={probeLocations}
        // Default to every shared region so a new monitor is actually probed;
        // an empty selection means nothing checks it.
        defaultValues={{
          probeLocationIds: probeLocations.filter((l) => l.shared).map((l) => l.id),
        }}
      />
    </div>
  );
}
