import { Separator } from "@openmonitor/ui";
import { MonitorConfigForm } from "~/components/monitor-config-form";
import { createMonitor } from "~/lib/actions/monitors";

export default function NewMonitorPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">New monitor</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Add an endpoint to probe and report on. Configure response-time and schedule
          after creation.
        </p>
      </header>
      <Separator />
      <MonitorConfigForm mode="create" action={createMonitor} />
    </div>
  );
}
