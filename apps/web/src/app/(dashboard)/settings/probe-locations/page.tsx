import { asc, db, eq, isNull, or, schema } from "@openmonitor/db";
import {
  Button,
  Card,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  Input,
  Label,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@openmonitor/ui";
import { CopyButton } from "~/components/copy-button";
import {
  type MonitorOption,
  type ProbeLocationRow,
  ProbeLocationsTable,
} from "~/components/probe-locations-table";
import { createProbeLocation } from "~/lib/actions/probe-locations";
import { isOperator } from "~/lib/operator";
import { getCurrentWorkspace } from "~/lib/workspace";

export default async function ProbeLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; token?: string; rotated?: string }>;
}) {
  const { created, token, rotated } = await searchParams;
  const ws = await getCurrentWorkspace();

  const locations = await db()
    .select({
      id: schema.probeLocations.id,
      name: schema.probeLocations.name,
      region: schema.probeLocations.region,
      enabled: schema.probeLocations.enabled,
      lastSeenAt: schema.probeLocations.lastSeenAt,
      workspaceId: schema.probeLocations.workspaceId,
    })
    .from(schema.probeLocations)
    // Shared locations are the operator's fleet, visible to every workspace.
    .where(
      or(
        isNull(schema.probeLocations.workspaceId),
        eq(schema.probeLocations.workspaceId, ws.workspaceId),
      ),
    )
    .orderBy(asc(schema.probeLocations.region));

  const monitors: MonitorOption[] = await db()
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      slug: schema.monitors.slug,
    })
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, ws.workspaceId))
    .orderBy(asc(schema.monitors.slug));

  // Scoped to this workspace's monitors. A shared location carries assignments
  // from every tenant that selected it, and an unfiltered read would ship their
  // monitor ids to this page and show the wrong boxes ticked.
  const assignments = await db()
    .select({
      probeLocationId: schema.probeLocationMonitors.probeLocationId,
      monitorId: schema.probeLocationMonitors.monitorId,
    })
    .from(schema.probeLocationMonitors)
    .innerJoin(schema.monitors, eq(schema.monitors.id, schema.probeLocationMonitors.monitorId))
    .where(eq(schema.monitors.workspaceId, ws.workspaceId));

  const byLocation = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byLocation.get(a.probeLocationId) ?? [];
    list.push(a.monitorId);
    byLocation.set(a.probeLocationId, list);
  }

  // Shared locations belong to the deployment, not to any workspace, so only an
  // instance operator may change one. The server actions enforce this; mirroring
  // it here keeps the UI from offering buttons that would only throw.
  const operator = isOperator(ws.email);

  const rows: ProbeLocationRow[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    region: l.region,
    enabled: l.enabled,
    lastSeenAt: l.lastSeenAt,
    shared: l.workspaceId === null,
    canManage: l.workspaceId === null ? operator : ws.role === "admin",
    monitorIds: byLocation.get(l.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Probe locations</SectionTitle>
        <SectionDescription>
          Each location runs a checker and reports results under its own region. The token
          identifies the location, so a checker can't report as a region it isn't. Shared locations
          belong to this deployment and can be selected by any workspace; monitors choose their
          regions on the monitor form.
        </SectionDescription>
      </SectionHeader>

      {created && token ? (
        <Card className="border-primary/40 bg-primary/5 p-4">
          <h3 className="font-semibold text-sm">
            {rotated ? "New token generated" : "Location created"}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Copy this now — only a hash is stored, so it can't be shown again. Set it as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">PROBE_TOKEN</code> on that
            location's checker.
            {rotated ? " The previous token stopped working immediately." : null}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs">
              {token}
            </code>
            <CopyButton value={token} />
          </div>
        </Card>
      ) : null}

      <ProbeLocationsTable locations={rows} monitors={monitors} />

      <FormCard className="max-w-2xl">
        <form action={createProbeLocation}>
          <FormCardHeader>
            <FormCardTitle>Add a location</FormCardTitle>
            <FormCardDescription>
              Deploy a checker with the generated token to start probing from a new region.
            </FormCardDescription>
          </FormCardHeader>
          <FormCardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required placeholder="EU West (Frankfurt)" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  name="region"
                  required
                  placeholder="eu-west"
                  pattern="[a-z0-9\-]+"
                />
                <p className="text-muted-foreground text-xs">
                  Lowercase, numbers and dashes. Stored on every probe result.
                </p>
              </div>
            </div>
            {operator ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="shared" className="mt-0.5" />
                <span>
                  Shared across all workspaces
                  <span className="block text-muted-foreground text-xs">
                    Part of this deployment's fleet, selectable by every workspace. Leave unticked
                    for a location only this workspace can see.
                  </span>
                </span>
              </label>
            ) : null}
          </FormCardContent>
          <FormCardFooter>
            <FormCardFooterInfo>
              {operator
                ? "The token is shown once, on creation."
                : "Private to this workspace. The token is shown once, on creation."}
            </FormCardFooterInfo>
            <Button type="submit">Create location</Button>
          </FormCardFooter>
        </form>
      </FormCard>
    </div>
  );
}
