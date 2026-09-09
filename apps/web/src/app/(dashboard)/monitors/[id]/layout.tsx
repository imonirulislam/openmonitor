import { and, db, eq, schema } from "@openmonitor/db";
import { Badge, SectionGroupTitle, Separator } from "@openmonitor/ui";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonitorTabs } from "~/components/monitor-tabs";
import { monitorIdFrom } from "~/lib/resolve-entity";
import { getCurrentWorkspaceId } from "~/lib/workspace";

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "default"> = {
  up: "success",
  down: "destructive",
  degraded: "warning",
  unknown: "default",
};

export default async function MonitorDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: idOrSlug } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const id = await monitorIdFrom(idOrSlug, workspaceId);
  const [monitor] = await db()
    .select()
    .from(schema.monitors)
    .where(and(eq(schema.monitors.id, id), eq(schema.monitors.workspaceId, workspaceId)))
    .limit(1);
  if (!monitor) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/monitors"
          className="inline-flex items-center gap-1.5 font-mono text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3" /> All monitors
        </Link>
      </div>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SectionGroupTitle>{monitor.name}</SectionGroupTitle>
          <Badge variant={STATUS_VARIANT[monitor.currentStatus]}>{monitor.currentStatus}</Badge>
          {!monitor.enabled ? <Badge variant="outline">disabled</Badge> : null}
        </div>
        <p className="mt-1 font-mono text-muted-foreground text-xs">{monitor.url}</p>
      </header>

      <MonitorTabs monitorId={idOrSlug} />
      <Separator />

      {children}
    </div>
  );
}
