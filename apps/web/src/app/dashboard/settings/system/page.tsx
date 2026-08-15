import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  withToastRedirect,
} from "@openmonitor/ui";
import { redirect } from "next/navigation";
import { auth } from "~/auth";
import { CheckerTelemetryTable } from "~/components/checker-telemetry-table";
import { runRetentionAction } from "~/lib/actions/system";

const API_URL = process.env.API_URL ?? "http://localhost:5002";
const PROBE_API_KEY = process.env.PROBE_API_KEY ?? "";

type RetentionResp = {
  retention: {
    enabled: boolean;
    runDays: number;
    eventDays: number;
    atUtc: string;
    lastRun: {
      startedAt: string;
      finishedAt: string;
      monitorRunsDeleted: number;
      eventsDeleted: number;
      error?: string;
    } | null;
    nextRunAt: string | null;
  };
  counts: {
    monitorRuns: number;
    events: number;
    eventsPending: number;
    eventsFailed: number;
  } | null;
};

type CheckerResp = {
  healthy: boolean;
  enabledCount: number;
  overdueCount: number;
  monitors: Array<{
    id: string;
    slug: string;
    name: string;
    kind: "http" | "tcp" | "dns";
    enabled: boolean;
    currentStatus: "up" | "down" | "degraded" | "unknown";
    lastCheckedAt: string | null;
    intervalSeconds: number;
    consecutiveFailures: number;
    lastCheckedAgoMs: number | null;
    overdue: boolean;
  }>;
};

async function fetchSystem<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${PROBE_API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function SystemPage() {
  // Admin-only screen. Editors and viewers get bounced to the
  // settings index. We don't have a dedicated `requireAdmin()` helper yet,
  // so this is gated inline.
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") {
    redirect(
      withToastRedirect("/dashboard/settings", "Admin role required for System settings", "error"),
    );
  }

  const [retention, checker] = await Promise.all([
    fetchSystem<RetentionResp>("/v1/system/scheduler"),
    fetchSystem<CheckerResp>("/v1/system/checker"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-medium text-base">System</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Internal scheduler and probe-checker telemetry.
        </p>
      </div>

      {/* Retention card */}
      <Card>
        <CardHeader>
          <CardTitle>Retention sweeper</CardTitle>
          <CardDescription>
            Daily cleanup of <span className="font-mono">monitor_runs</span> and{" "}
            <span className="font-mono">events</span>. Runs in-process when{" "}
            <span className="font-mono">RETENTION_ENABLED=on</span>; you can also invoke it manually
            from this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {retention ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="Enabled" value={retention.retention.enabled ? "yes" : "no"} />
                <Stat
                  label="Run window"
                  value={`runs > ${retention.retention.runDays}d, sent events > ${retention.retention.eventDays}d`}
                />
                <Stat label="Daily at" value={`${retention.retention.atUtc} UTC`} />
                <Stat
                  label="Next run"
                  value={
                    retention.retention.nextRunAt
                      ? new Date(retention.retention.nextRunAt).toLocaleString()
                      : "—"
                  }
                />
              </dl>
              <Separator />
              <div>
                <p className="font-medium text-sm">Last run</p>
                {retention.retention.lastRun ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <Stat
                      label="Started"
                      value={new Date(retention.retention.lastRun.startedAt).toLocaleString()}
                    />
                    <Stat
                      label="Duration"
                      value={`${
                        new Date(retention.retention.lastRun.finishedAt).getTime() -
                        new Date(retention.retention.lastRun.startedAt).getTime()
                      } ms`}
                    />
                    <Stat
                      label="monitor_runs deleted"
                      value={retention.retention.lastRun.monitorRunsDeleted.toLocaleString()}
                    />
                    <Stat
                      label="events deleted"
                      value={retention.retention.lastRun.eventsDeleted.toLocaleString()}
                    />
                    {retention.retention.lastRun.error ? (
                      <div className="col-span-full rounded border border-destructive/30 bg-destructive/10 p-2 font-mono text-destructive text-xs">
                        Error: {retention.retention.lastRun.error}
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-1 text-muted-foreground text-xs">
                    No runs yet since the API process started.
                  </p>
                )}
              </div>
              <Separator />
              <div>
                <p className="font-medium text-sm">Current row counts</p>
                {retention.counts ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <Stat
                      label="monitor_runs"
                      value={retention.counts.monitorRuns.toLocaleString()}
                    />
                    <Stat label="events" value={retention.counts.events.toLocaleString()} />
                    <Stat label="pending" value={retention.counts.eventsPending.toLocaleString()} />
                    <Stat label="failed" value={retention.counts.eventsFailed.toLocaleString()} />
                  </dl>
                ) : null}
              </div>
              <form
                action={runRetentionAction}
                className="flex items-center gap-3 border-t border-border pt-4"
              >
                <Button type="submit" size="sm">
                  Run sweep now
                </Button>
                <p className="text-muted-foreground text-xs">
                  Idempotent — runs the same SQL the daily scheduler does.
                </p>
              </form>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Could not reach the API. Check that <span className="font-mono">API_URL</span> and{" "}
              <span className="font-mono">PROBE_API_KEY</span> are set in this app's env.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Checker card */}
      <Card>
        <CardHeader>
          <CardTitle>
            Probe checker
            {checker ? (
              <span
                className={`ml-3 rounded px-2 py-0.5 font-mono text-xs ${
                  checker.healthy
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                }`}
              >
                {checker.healthy ? "healthy" : `${checker.overdueCount} overdue`}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            Inferred from the freshness of each monitor's most recent probe. A monitor is "overdue"
            when its last probe is older than 3× its configured interval — usually means the Go
            checker process is stuck or disconnected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checker ? (
            <CheckerTelemetryTable rows={checker.monitors} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Could not reach the API to fetch checker telemetry.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
