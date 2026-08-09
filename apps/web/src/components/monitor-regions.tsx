"use client";

import { Button, Card, cn } from "@openmonitor/ui";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { RowAction, RowActions } from "~/components/row-actions";

/**
 * Mirrors openstatus's per-region table on the monitor overview. Dummy data
 * for now — we only run a single region (`local`) and don't yet split
 * latency by point-of-presence. Wired so the visual structure is in place
 * for when real multi-region probing lands.
 */

type RegionRow = {
  code: string;
  flag: string;
  name: string;
  trend: number[];
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
};

// Hardcoded for now. Three regions matching openstatus's screenshot — ams,
// iad, sin — so the layout reads consistently while real data is plumbed.
const DUMMY_REGIONS: RegionRow[] = [
  {
    code: "ams",
    flag: "🇳🇱",
    name: "Amsterdam",
    trend: [125, 142, 130, 118, 165, 148, 132, 158, 138, 122, 152, 135, 128, 145, 130],
    p50: 129,
    p90: 129,
    p99: 129,
    min: 118,
    max: 182,
  },
  {
    code: "iad",
    flag: "🇺🇸",
    name: "Washington",
    trend: [148, 145, 152, 158, 175, 165, 170, 215, 198, 168, 175, 162, 145, 158, 160],
    p50: 141,
    p90: 141,
    p99: 141,
    min: 122,
    max: 254,
  },
  {
    code: "sin",
    flag: "🇸🇬",
    name: "Singapore",
    trend: [205, 220, 195, 245, 280, 265, 320, 380, 350, 310, 295, 268, 232, 205, 218],
    p50: 237,
    p90: 237,
    p99: 237,
    min: 186,
    max: 422,
  },
];

type SortKey = "p50" | "p90" | "p99";

export function MonitorRegions() {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");

  const sorted = sort
    ? [...DUMMY_REGIONS].sort((a, b) => {
        const diff = a[sort.key] - b[sort.key];
        return sort.desc ? -diff : diff;
      })
    : DUMMY_REGIONS;

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, desc: false };
      if (!prev.desc) return { key, desc: true };
      return null;
    });
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
                  <td className="px-4 py-3 font-mono text-sm">
                    <span className="mr-2">{r.flag}</span>
                    {r.code}
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
                      <RowAction onSelect={() => {}}>Pin region</RowAction>
                      <RowAction onSelect={() => {}}>View logs</RowAction>
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
