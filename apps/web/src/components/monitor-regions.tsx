"use client";

import { Button, Card, cn } from "@openmonitor/ui";
import Link from "next/link";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { RowAction, RowActions } from "~/components/row-actions";

/**
 * Per-region latency for one monitor. Rows come from `monitor_runs` grouped by
 * region, joined with each region's current status from `monitor_region_status`.
 */

export interface RegionRow {
  /** Region code as stored on probe results, e.g. "eu-west". */
  code: string;
  /** Location name from probe_locations, or the code if the location is gone. */
  name: string;
  status: "up" | "down" | "degraded" | "unknown";
  /** Hourly average latency over the window, oldest first. */
  trend: number[];
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
}

const STATUS_DOT: Record<RegionRow["status"], string> = {
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

type SortKey = "p50" | "p90" | "p99";

export function MonitorRegions({
  regions,
  monitorId,
}: {
  regions: RegionRow[];
  monitorId: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");

  const sorted = sort
    ? [...regions].sort((a, b) => {
        const diff = a[sort.key] - b[sort.key];
        return sort.desc ? -diff : diff;
      })
    : regions;

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, desc: false };
      if (!prev.desc) return { key, desc: true };
      return null;
    });
  }

  if (regions.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium text-lg">Regions</h2>
          <p className="font-mono text-muted-foreground text-sm tracking-tight">
            Every selected region's latency trend
          </p>
        </div>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No probe results yet. Add a probe location in{" "}
            <Link href="/dashboard/settings/probe-locations" className="underline">
              Settings → Probe locations
            </Link>{" "}
            and point a checker at it.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium text-lg">Regions</h2>
        <p className="font-mono text-muted-foreground text-sm tracking-tight">
          Every selected region's latency trend
        </p>
      </div>

      <p className="text-sm">
        The <FilterChip>P50</FilterChip>{" "}
        <span className="text-muted-foreground">quantile trend over the</span>{" "}
        <FilterChip>Last day</FilterChip>
      </p>

      <div className="inline-flex h-8 w-fit items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
        <button
          type="button"
          onClick={() => setView("table")}
          className={cn(
            "rounded-sm px-3 py-1 text-sm transition-colors",
            view === "table"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Table
        </button>
        <button
          type="button"
          onClick={() => setView("chart")}
          className={cn(
            "rounded-sm px-3 py-1 text-sm transition-colors",
            view === "chart"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Chart
        </button>
      </div>

      {view === "table" ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Trend</th>
                <th className="w-[80px] px-4 py-3 text-right font-medium">
                  <SortHeader
                    label="P50"
                    active={sort?.key === "p50"}
                    desc={sort?.desc}
                    onClick={() => toggleSort("p50")}
                  />
                </th>
                <th className="w-[80px] px-4 py-3 text-right font-medium">
                  <SortHeader
                    label="P90"
                    active={sort?.key === "p90"}
                    desc={sort?.desc}
                    onClick={() => toggleSort("p90")}
                  />
                </th>
                <th className="w-[80px] px-4 py-3 text-right font-medium">
                  <SortHeader
                    label="P99"
                    active={sort?.key === "p99"}
                    desc={sort?.desc}
                    onClick={() => toggleSort("p99")}
                  />
                </th>
                <th className="w-[40px] px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr key={r.code} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[r.status])}
                      />
                      <span className="font-mono">{r.code}</span>
                    </div>
                    {r.name !== r.code ? (
                      <span className="text-muted-foreground text-xs">{r.name}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 flex-1">
                        <Sparkline data={r.trend} />
                      </div>
                      <div className="flex flex-col items-end font-mono text-[10px] text-muted-foreground tabular-nums">
                        <span>{r.max}ms</span>
                        <span>{r.min}ms</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {r.p50}
                    <span className="ml-0.5 text-[10px] text-muted-foreground">ms</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {r.p90}
                    <span className="ml-0.5 text-[10px] text-muted-foreground">ms</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {r.p99}
                    <span className="ml-0.5 text-[10px] text-muted-foreground">ms</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions>
                      <RowAction asChild>
                        <Link href={`/dashboard/monitors/${monitorId}/logs?region=${r.code}`}>
                          View logs
                        </Link>
                      </RowAction>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Chart view — coming when multi-region probing lands.
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
        <span>0 of {sorted.length} row(s) selected.</span>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">Rows per page</span>
          <span className="rounded border border-border bg-card px-2 py-1 font-mono">20</span>
          <span className="ml-2">Page 1 of 1</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled
              aria-label="First page"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled
              aria-label="Previous page"
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled
              aria-label="Next page"
            >
              ›
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled
              aria-label="Last page"
            >
              »
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-card px-2 py-0.5 font-mono text-xs">
      {children}
    </span>
  );
}

function SortHeader({
  label,
  active,
  desc,
  onClick,
}: {
  label: string;
  active: boolean;
  desc: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        active && "text-foreground",
      )}
    >
      {label}
      <span className="text-[8px] leading-none opacity-60">
        {active ? (desc ? "▼" : "▲") : "⇅"}
      </span>
    </button>
  );
}

/** Tiny inline sparkline. Stroke is `--color-success` so green sells the visual. */
function Sparkline({ data }: { data: number[] }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--color-success)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
