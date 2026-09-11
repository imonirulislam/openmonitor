import { db, desc, eq, schema } from "@openmonitor/db";
import {
  Button,
  SectionDescription,
  SectionHeader,
  SectionHeaderRow,
  SectionTitle,
} from "@openmonitor/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { HeartbeatsTable } from "~/components/heartbeats-table";
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
      <SectionHeaderRow>
        <SectionHeader>
          <SectionTitle>Heartbeats</SectionTitle>
          <SectionDescription>
            Push-based monitors. Cron jobs hit a token URL on each run; we alert when pings stop.
          </SectionDescription>
        </SectionHeader>
        <Button asChild size="sm">
          <Link href="/heartbeats/new">
            <PlusIcon /> New heartbeat
          </Link>
        </Button>
      </SectionHeaderRow>

      <HeartbeatsTable
        rows={rows.map((h) => ({
          id: h.id,
          slug: h.slug,
          name: h.name,
          currentStatus: h.currentStatus,
          expectedIntervalSeconds: h.expectedIntervalSeconds,
          graceSeconds: h.graceSeconds,
          lastPingAt: h.lastPingAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
