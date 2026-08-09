"use client";

import type { MonitorHistory } from "@openmonitor/api-client";
import {
  LocalTime,
  StatusMonitor,
  StatusMonitorHeader,
  StatusTracker,
  type TrackerDay,
} from "@openmonitor/ui";
import Link from "next/link";
import { useMemo } from "react";
import { useLocalTzHistory } from "~/lib/use-local-tz-history";

type MonitorStatus = "up" | "down" | "degraded" | "unknown";

/**
 * Linked monitor card for the /monitors index. Same TZ-correction as
 * MonitorRow, plus a stats footer (probes / failures / incidents) and a
 * link to the per-monitor detail page.
 */
export function MonitorListRow({
  monitor,
  initialHistory,
  incidentCount,
  href,
}: {
  monitor: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: MonitorStatus;
  };
  initialHistory: MonitorHistory;
  incidentCount: number;
  href?: string;
}) {
  const history = useLocalTzHistory(monitor.slug, initialHistory);
  const days = history.days as TrackerDay[];
  const stats = useMemo(() => computeStats(days), [days]);
  const firstDate = days[0]?.date;

  return (
    <Link
      href={href ?? `/monitors/${monitor.slug}`}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <StatusMonitor className="transition-colors group-hover:border-foreground/30">
        <StatusMonitorHeader
          name={monitor.name}
          description={monitor.description}
          status={monitor.status}
          uptime={stats.uptime !== null ? `${stats.uptime.toFixed(2)}%` : undefined}
        />
        <StatusTracker days={days} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>
            {firstDate ? <LocalTime date={firstDate} format="LLL d" /> : "—"} → today
          </span>
          <div className="flex items-center gap-3">
            <Stat label="probes" value={stats.totalProbes.toLocaleString()} />
            <Stat label="failed" value={stats.totalFailed.toLocaleString()} />
            <Stat label="incidents" value={incidentCount.toString()} />
          </div>
        </div>
      </StatusMonitor>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      <span className="text-muted-foreground/70">{label}</span>
    </span>
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
    totalProbes: total,
    totalFailed: failed,
    uptime: total === 0 ? null : (ok / total) * 100,
  };
}
