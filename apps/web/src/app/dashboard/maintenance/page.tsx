import { db, desc, eq, schema } from "@openmonitor/db";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateTimeLocalInput,
  Input,
  Label,
  LocalTime,
  Separator,
  Textarea,
} from "@openmonitor/ui";
import { MonitorMultiSelect } from "~/components/monitor-multi-select";
import { RowActionAction, RowActionSeparator, RowActions } from "~/components/row-actions";
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
        <h1 className="font-semibold text-xl tracking-tight">Maintenance</h1>
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
        <h2 className="font-medium text-sm tracking-tight">Past and upcoming</h2>
        <ul className="flex flex-col gap-2">
          {maintenances.map((m) => (
            <li key={m.id}>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-sm">{m.title}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{m.status}</Badge>
                      <RowActions>
                        {m.status !== "cancelled" && m.status !== "completed" ? (
                          <>
                            <RowActionAction action={cancelMaintenance.bind(null, m.id)}>
                              Cancel
                            </RowActionAction>
                            <RowActionSeparator />
                          </>
                        ) : null}
                        <RowActionAction action={deleteMaintenance.bind(null, m.id)} destructive>
                          Delete
                        </RowActionAction>
                      </RowActions>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    <LocalTime date={m.startsAt} /> → <LocalTime date={m.endsAt} />
                  </p>
                  {m.description ? (
                    <p className="mt-2 text-foreground text-sm">{m.description}</p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
          {maintenances.length === 0 ? (
            <p className="text-muted-foreground text-sm">No windows scheduled.</p>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
