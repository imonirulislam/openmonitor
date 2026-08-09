import { notFound } from "next/navigation";
import { db, eq, schema, type Assertion } from "@openmonitor/db";
import {
  Button,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  Input,
  Label,
} from "@openmonitor/ui";
import { MonitorConfigForm } from "~/components/monitor-config-form";
import { MonitorResponseTimeForm } from "~/components/monitor-response-time-form";
import {
  deleteMonitor,
  updateMonitorConfig,
  updateMonitorResponseTime,
  updateMonitorSchedule,
} from "~/lib/actions/monitors";

export default async function EditMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [monitor] = await db()
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, id))
    .limit(1);
  if (!monitor) notFound();

  const hostPort =
    monitor.kind === "tcp" && monitor.host && monitor.port != null
      ? `${monitor.host}:${monitor.port}`
      : "";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <MonitorConfigForm
        mode="edit"
        action={updateMonitorConfig.bind(null, id)}
        defaultValues={{
          slug: monitor.slug,
          name: monitor.name,
          description: monitor.description ?? "",
          kind: monitor.kind,
          active: monitor.enabled,
          url: monitor.url ?? "",
          method: (monitor.method ?? "GET") as never,
          headers: monitor.headers,
          body: monitor.body ?? "",
          hostPort,
          dnsHost: monitor.kind === "dns" ? (monitor.host ?? "") : "",
          followRedirects: monitor.followRedirects,
          assertions: (monitor.assertions ?? []) as Assertion[],
        }}
      />

      <MonitorResponseTimeForm
        action={updateMonitorResponseTime.bind(null, id)}
        defaultValues={{
          degradedAfterMs: monitor.degradedAfterMs ?? undefined,
          timeoutMs: monitor.timeoutMs,
        }}
      />

      {/* Schedule */}
      <FormCard asForm action={updateMonitorSchedule.bind(null, id)}>
        <FormCardHeader>
          <FormCardTitle>Schedule & retries</FormCardTitle>
          <FormCardDescription>
            How often to probe and how many retries before flipping to down.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Interval (seconds)"
              name="intervalSeconds"
              type="number"
              defaultValue={String(monitor.intervalSeconds)}
              min={30}
              max={3600}
            />
            <Field
              label="Retry count"
              name="retryCount"
              type="number"
              defaultValue={String(monitor.retryCount)}
              min={0}
              max={10}
            />
            <Field
              label="Retry delay (seconds)"
              name="retryDelaySeconds"
              type="number"
              defaultValue={String(monitor.retryDelaySeconds)}
              min={1}
              max={300}
            />
            <Field
              label="Auto-incident threshold"
              name="autoIncidentThreshold"
              type="number"
              defaultValue={
                monitor.autoIncidentThreshold != null
                  ? String(monitor.autoIncidentThreshold)
                  : ""
              }
              min={0}
              max={50}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            With <span className="font-mono">retry count = N</span>, a monitor only flips
            to <span className="font-mono">down</span> after the initial probe + N
            retries fail in a row. Useful for cutting transient-network false positives.
          </p>
          <p className="text-muted-foreground text-xs">
            <span className="font-mono">Auto-incident threshold</span>: after this many
            consecutive <span className="font-mono">down</span> probes the API
            auto-opens a public incident; recovery auto-resolves it. Leave blank or 0 to
            disable.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked={monitor.enabled}
              className="size-4 rounded border-border"
            />
            Enabled
          </label>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            Picked up by the checker within ~1s via pg_notify.
          </FormCardFooterInfo>
          <Button type="submit">Save schedule</Button>
        </FormCardFooter>
      </FormCard>

      {/* Danger zone */}
      <FormCard className="border-destructive/30">
        <FormCardHeader>
          <FormCardTitle className="text-destructive">Danger zone</FormCardTitle>
          <FormCardDescription>
            Permanently remove this monitor and its history.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardFooter className="bg-destructive/5">
          <FormCardFooterInfo>
            Deletes monitor_runs, incident links, and channel links.
          </FormCardFooterInfo>
          <form action={deleteMonitor.bind(null, id)}>
            <Button variant="destructive" type="submit">
              Delete monitor
            </Button>
          </form>
        </FormCardFooter>
      </FormCard>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        min={min}
        max={max}
      />
    </div>
  );
}
