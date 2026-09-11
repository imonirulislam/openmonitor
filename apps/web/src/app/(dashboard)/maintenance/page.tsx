import { db, desc, eq, schema } from "@openmonitor/db";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateTimeLocalInput,
  Input,
  Label,
  SectionGroupTitle,
  SectionLabel,
  Separator,
  Textarea,
} from "@openmonitor/ui";
import { MaintenancesTable } from "~/components/maintenances-table";
import { MonitorMultiSelect } from "~/components/monitor-multi-select";
import { cancelMaintenance, createMaintenance, deleteMaintenance } from "~/lib/actions/maintenance";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function MaintenancePage() {
  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();
  const maintenances = await conn
    .select()
    .from(schema.maintenances)
    .where(eq(schema.maintenances.workspaceId, workspaceId))
    .orderBy(desc(schema.maintenances.startsAt))
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <SectionGroupTitle>Maintenance</SectionGroupTitle>
        <p className="mt-1 text-muted-foreground text-sm">
          Schedule planned outages so customers know what to expect.
        </p>
      </header>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Schedule new window</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createMaintenance} className="flex flex-col gap-3">
            <Input name="title" placeholder="Title" required />
            <Textarea name="description" placeholder="Description (optional)" rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startsAt">Starts at</Label>
                <DateTimeLocalInput id="startsAt" name="startsAt" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endsAt">Ends at</Label>
                <DateTimeLocalInput id="endsAt" name="endsAt" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recurrenceRule">
                  Recurrence{" "}
                  <span className="font-normal text-muted-foreground">(optional, RRULE)</span>
                </Label>
                <Input
                  id="recurrenceRule"
                  name="recurrenceRule"
                  placeholder="FREQ=WEEKLY;BYDAY=TU"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recurrenceUntil">Repeat until</Label>
                <DateTimeLocalInput id="recurrenceUntil" name="recurrenceUntil" />
              </div>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Affected monitors</legend>
              <MonitorMultiSelect name="monitorIds" />
            </fieldset>
            <Button type="submit" className="self-start">
              Schedule
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionLabel>Past and upcoming</SectionLabel>
        <MaintenancesTable
          rows={maintenances.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            status: m.status,
            startsAt: m.startsAt.toISOString(),
            endsAt: m.endsAt.toISOString(),
          }))}
          showStatus
          cancelAction={cancelMaintenance}
          deleteAction={deleteMaintenance}
          paramScope="mw"
        />
      </div>
    </div>
  );
}
