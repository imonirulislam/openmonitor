import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { db, desc, eq, schema } from "@openmonitor/db";
import { Badge, Button, Card, LocalTime, Separator } from "@openmonitor/ui";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function HeartbeatsIndex() {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await db()
    .select()
    .from(schema.heartbeatMonitors)
    .where(eq(schema.heartbeatMonitors.workspaceId, workspaceId))
    .orderBy(desc(schema.heartbeatMonitors.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Heartbeats</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Push-based monitors. Cron jobs hit a token URL on each run; we alert when pings stop.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/heartbeats/new">
            <PlusIcon /> New heartbeat
          </Link>
        </Button>
      </header>
      <Separator />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((h) => (
          <Card key={h.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/heartbeats/${h.id}`}
                  className="font-semibold text-base hover:underline"
                >
                  {h.name}
                </Link>
                <p className="mt-0.5 font-mono text-muted-foreground text-xs">{h.slug}</p>
              </div>
              <Badge
                variant={
                  h.currentStatus === "up"
                    ? "success"
                    : h.currentStatus === "down"
                      ? "destructive"
                      : "default"
                }
              >
                {h.currentStatus}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>
                expected{" "}
                <span className="font-semibold text-foreground tabular-nums normal-case">
                  every {h.expectedIntervalSeconds}s
                </span>
              </span>
              <span>
                grace{" "}
                <span className="font-semibold text-foreground tabular-nums normal-case">
                  {h.graceSeconds}s
                </span>
              </span>
              {h.lastPingAt ? (
                <span>
                  last{" "}
                  <span className="font-semibold text-foreground normal-case">
                    <LocalTime date={h.lastPingAt.toISOString()} format="LLL d, HH:mm" />
                  </span>
                </span>
              ) : (
                <span>never pinged</span>
              )}
            </div>
          </Card>
        ))}
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            No heartbeats yet.{" "}
            <Link href="/dashboard/heartbeats/new" className="underline">
              Create one
            </Link>
            .
          </Card>
        ) : null}
      </div>
    </div>
  );
}
