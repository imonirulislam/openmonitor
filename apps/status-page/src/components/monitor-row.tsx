"use client";

import type { MonitorHistory } from "@openmonitor/api-client";
import {
  LocalTime,
  StatusMonitor,
  StatusMonitorHeader,
  StatusTracker,
  type TrackerDay,
} from "@openmonitor/ui";
import { useMemo } from "react";
import { useLocalTzHistory } from "~/lib/use-local-tz-history";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

/** One monitor card with its 90-day tracker, TZ-corrected on the client. */
export function MonitorRow({
  monitor,
  initialHistory,
}: {
  monitor: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: MonitorStatus;
  };
  initialHistory: MonitorHistory;
}) {
  const history = useLocalTzHistory(monitor.slug, initialHistory);
  const days = history.days as TrackerDay[];
  const uptime = useMemo(() => computeUptime(days), [days]);
  const firstDate = days[0]?.date;

  return (
    <StatusMonitor>
      <StatusMonitorHeader
        name={monitor.name}
        description={monitor.description}
        status={monitor.status}
        uptime={uptime !== null ? `${uptime.toFixed(2)}%` : undefined}
      />
      <StatusTracker days={days} />
      <div className="flex justify-between font-mono text-muted-foreground text-[10px] uppercase tracking-wide">
        <span>{firstDate ? <LocalTime date={firstDate} format="LLL d" /> : "90d"}</span>
        <span>Today</span>
      </div>
    </StatusMonitor>
  );
}

function computeUptime(days: TrackerDay[]): number | null {
  let total = 0;
  let ok = 0;
  for (const d of days) {
    total += d.total;
    ok += d.ok;
  }
  return total === 0 ? null : (ok / total) * 100;
}
