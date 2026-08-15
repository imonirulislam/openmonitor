import { asc, db, eq, schema } from "@openmonitor/db";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LocalTime,
  MarkdownView,
  Select,
  Separator,
  Textarea,
} from "@openmonitor/ui";
import { notFound } from "next/navigation";
import { IncidentSeverityBadge, IncidentStatusBadge } from "~/components/incident-badges";
import { postIncidentUpdate } from "~/lib/actions/incidents";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = db();

  const [incident] = await conn
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.id, id))
    .limit(1);
  if (!incident) notFound();

  const updates = await conn
    .select()
    .from(schema.incidentUpdates)
    .where(eq(schema.incidentUpdates.incidentId, id))
    .orderBy(asc(schema.incidentUpdates.createdAt));

  const linkedMonitors = await conn
    .select({ id: schema.monitors.id, name: schema.monitors.name })
    .from(schema.incidentMonitors)
    .innerJoin(schema.monitors, eq(schema.monitors.id, schema.incidentMonitors.monitorId))
    .where(eq(schema.incidentMonitors.incidentId, id));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-xl tracking-tight">{incident.title}</h1>
          <IncidentSeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.status} />
        </div>
        <p className="mt-1 font-mono text-muted-foreground text-xs">
          {"started "}
          <LocalTime date={incident.startedAt} />
          {incident.resolvedAt ? (
            <>
              {" · resolved "}
              <LocalTime date={incident.resolvedAt} />
            </>
          ) : null}
        </p>
        {linkedMonitors.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Affected:</span>
            {linkedMonitors.map((m) => (
              <Badge key={m.id} variant="outline">
                {m.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm tracking-tight">Timeline</h2>
        <ol className="space-y-4 border-border border-l pl-4">
          {updates.map((u) => (
            <li key={u.id}>
              <div className="mb-1">
                <IncidentStatusBadge status={u.status} />
              </div>
              <MarkdownView>{u.message}</MarkdownView>
              <LocalTime
                date={u.createdAt}
                className="block font-mono text-muted-foreground text-xs"
              />
            </li>
          ))}
        </ol>
      </section>

      {incident.status !== "resolved" ? (
        <Card>
          <CardHeader>
            <CardTitle>Post update</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={postIncidentUpdate.bind(null, incident.id)}
              className="flex flex-col gap-3"
            >
              <Select name="status" defaultValue={incident.status}>
                <option value="investigating">Investigating</option>
                <option value="identified">Identified</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
              </Select>
              <Textarea name="message" rows={3} required placeholder="What's the latest?" />
              <Button type="submit" className="self-start">
                Post update
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
