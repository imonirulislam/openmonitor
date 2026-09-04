import type { schema } from "@openmonitor/db";
import { Badge, Card, LocalTime } from "@openmonitor/ui";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { IncidentSeverityBadge, IncidentStatusBadge } from "./incident-badges";

type Incident = typeof schema.incidents.$inferSelect;
type Maintenance = typeof schema.maintenances.$inferSelect;

/**
 * Renders the body of the overview's "Incidents" / "Maintenance" sections.
 * The page owns the heading; this component just renders the list (or an
 * empty-state card).
 */
export function RecentIncidentsPanel({ rows }: { rows: Incident[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">No incidents found</Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-border">
        {rows.map((i) => (
          <li key={i.id}>
            <Link
              href={`/dashboard/incidents/${i.number}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.title}</p>
                <p className="font-mono text-muted-foreground text-xs">
                  {formatDistanceToNowStrict(i.startedAt, { addSuffix: true })} ·{" "}
                  {i.resolvedAt ? "resolved" : "active"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <IncidentSeverityBadge severity={i.severity} />
                <IncidentStatusBadge status={i.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RecentMaintenancePanel({ rows }: { rows: Maintenance[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">No maintenances found</Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-border">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.title}</p>
              <p className="font-mono text-muted-foreground text-xs">
                {formatDistanceToNowStrict(m.startsAt, { addSuffix: true })} ·{" "}
                <LocalTime date={m.startsAt.toISOString()} format="LLL d, HH:mm" /> →{" "}
                <LocalTime date={m.endsAt.toISOString()} format="LLL d, HH:mm" />
              </p>
            </div>
            <Badge variant="info">{m.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
