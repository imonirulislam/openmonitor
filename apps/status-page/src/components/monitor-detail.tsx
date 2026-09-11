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
import { type HistoryScope, useLocalTzHistory } from "~/lib/use-local-tz-history";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

/**
 * Per-monitor detail header: stat cards + the tracker. TZ-corrected on the
 * client. Stats recompute when the user-TZ refetch lands so totals match what
 * the user actually sees in the buckets.
 */
export function MonitorDetail({
  monitor,
  initialHistory,
  incidentCount,
  scope,
}: {
  monitor: {
    name: string;
    slug: string;
    description: string | null;
    status: MonitorStatus;
  };
  initialHistory: MonitorHistory;
  incidentCount: number;
  scope?: HistoryScope;
}) {
  const history = useLocalTzHistory(monitor.slug, initialHistory, scope);
  const days = history.days as TrackerDay[];
  const stats = useMemo(() => computeStats(days), [days]);
  const firstDate = days[0]?.date;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Uptime (90d)"
          value={stats.uptime !== null ? `${stats.uptime.toFixed(2)}%` : "—"}
        />
        <StatCard label="Total probes" value={stats.total.toLocaleString()} />
        <StatCard label="Failures" value={stats.failed.toLocaleString()} />
        <StatCard label="Incidents" value={incidentCount.toString()} />
      </div>

      <StatusMonitor>
        <StatusMonitorHeader
          name={monitor.name}
          description={monitor.description}
          status={monitor.status}
        />
        <StatusTracker days={days} />
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{firstDate ? <LocalTime date={firstDate} format="LLL d" /> : "—"}</span>
          <span>Today</span>
        </div>
      </StatusMonitor>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function computeStats(days: TrackerDay[]) {
  let total = 0;
  let ok = 0;
  let failed = 0;
  for (const d of days) {
    total += d.total;
    ok += d.ok;
    failed += d.failed;
  }
  return {
    total,
    ok,
    failed,
    uptime: total === 0 ? null : (ok / total) * 100,
  };
}
