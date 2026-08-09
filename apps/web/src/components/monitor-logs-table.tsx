"use client";

import { cn, LocalTime } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ClockIcon } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { DataTable } from "./data-table";
import { MonitorLogsToolbar } from "./monitor-logs-toolbar";
import { ProbeTimingBar } from "./probe-timing-bar";

type Row = {
  id: string;
  checkedAt: string;
  status: "up" | "down" | "degraded" | "unknown";
  statusCode: number | null;
  latencyMs: number | null;
  region: string;
  error: string | null;
  dns: number | null;
  connect: number | null;
  tls: number | null;
  ttfb: number | null;
  transfer: number | null;
};

const STATUS_DOT: Record<Row["status"], string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted",
};

/**
 * HTTP status-code coloring by class — mirrors openstatus's
 * `getStatusCodeVariant`: 2xx green, 3xx neutral, 4xx warning, 5xx red.
 * Falls back to the row's overall status when no code is present (e.g.
 * connection refused).
 */
function statusCodeClass(code: number | null, status: Row["status"]): string {
  if (code == null) {
    return status === "up"
      ? "text-success"
      : status === "down"
        ? "text-destructive"
        : status === "degraded"
          ? "text-warning"
          : "text-muted-foreground";
  }
  if (code >= 500) return "text-destructive";
  if (code >= 400) return "text-warning";
  if (code >= 300) return "text-muted-foreground";
  if (code >= 200) return "text-success";
  return "text-muted-foreground";
}

const columns: ColumnDef<Row>[] = [
  {
    id: "indicator",
    header: "",
    enableSorting: false,
    enableColumnFilter: false,
    cell: ({ row }) => (
      <span
        aria-label={row.original.status}
        title={row.original.status}
        className={cn("inline-block size-2.5 rounded-[2px]", STATUS_DOT[row.original.status])}
      />
    ),
  },
  {
    accessorKey: "checkedAt",
    header: "Timestamp",
    cell: ({ row }) => (
      <LocalTime
        date={row.original.checkedAt}
        format="LLL dd, y HH:mm:ss"
        className="font-mono text-foreground text-xs"
      />
    ),
    sortingFn: (a, b) => Date.parse(a.original.checkedAt) - Date.parse(b.original.checkedAt),
  },
  {
    accessorKey: "statusCode",
    header: "Status",
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          statusCodeClass(row.original.statusCode, row.original.status),
        )}
        title={row.original.error ?? undefined}
      >
        {row.original.statusCode ?? row.original.status.toUpperCase()}
      </span>
    ),
    filterFn: (row, _id, value: string[]) =>
      !value || value.length === 0 ? true : value.includes(row.original.status),
  },
  {
    accessorKey: "latencyMs",
    header: "Latency",
    cell: ({ row }) => (
      <span className="font-mono text-foreground text-xs tabular-nums">
        {row.original.latencyMs != null ? `${row.original.latencyMs} ms` : "—"}
      </span>
    ),
  },
  {
    accessorKey: "region",
    header: "Region",
    cell: ({ row }) => (
      <span className="font-mono text-foreground text-xs">{row.original.region}</span>
    ),
  },
  {
    id: "timing",
    header: "Timing",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <ProbeTimingBar
          phases={{
            dns: row.original.dns,
            connect: row.original.connect,
            tls: row.original.tls,
            ttfb: row.original.ttfb,
            transfer: row.original.transfer,
          }}
        />
        <ClockIcon className="size-3 text-muted-foreground" aria-hidden />
      </span>
    ),
  },
];

export function MonitorLogsTable({ rows }: { rows: Row[] }) {
  // Filter state lives in the URL via nuqs (?status=up,down&region=local)
  // — the toolbar reads/writes the same keys. We pre-filter rows here
  // before they reach the DataTable rather than wiring TanStack column
  // filters, since the DataTable doesn't expose its `table` instance to
  // the caller.
  const [statusFilter] = useQueryState("status", parseAsArrayOf(parseAsString));
  const [regionFilter] = useQueryState("region", parseAsArrayOf(parseAsString));

  const regions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.region);
    return [...seen].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const statuses = statusFilter && statusFilter.length > 0 ? new Set(statusFilter) : null;
    const regionsSel = regionFilter && regionFilter.length > 0 ? new Set(regionFilter) : null;
    if (!statuses && !regionsSel) return rows;
    return rows.filter((r) => {
      if (statuses && !statuses.has(r.status)) return false;
      if (regionsSel && !regionsSel.has(r.region)) return false;
      return true;
    });
  }, [rows, statusFilter, regionFilter]);

  return (
    <div className="flex flex-col gap-3">
      <MonitorLogsToolbar regions={regions} />
      <DataTable
        data={filtered}
        columns={columns}
        emptyMessage="No probe results match the current filters."
        initialPageSize={10}
      />
    </div>
  );
}
