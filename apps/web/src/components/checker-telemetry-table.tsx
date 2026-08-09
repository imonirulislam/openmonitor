"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@openmonitor/ui";
import { DataTable } from "./data-table";

export type CheckerRow = {
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
};

const STATUS_CLASS: Record<CheckerRow["currentStatus"], string> = {
  up: "bg-success/15 text-success",
  degraded: "bg-warning/15 text-warning",
  down: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

function formatAgo(ms: number | null): string {
  if (ms == null) return "never";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

const columns: ColumnDef<CheckerRow>[] = [
  {
    accessorKey: "name",
    header: "Monitor",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="font-mono text-muted-foreground text-xs">{row.original.slug}</div>
      </div>
    ),
  },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <span className="font-mono text-xs uppercase">{row.original.kind}</span>
    ),
    filterFn: (row, _id, value) =>
      !value || (Array.isArray(value) && value.length === 0)
        ? true
        : (value as string[]).includes(row.original.kind),
  },
  {
    accessorKey: "currentStatus",
    header: "Status",
    cell: ({ row }) => {
      if (!row.original.enabled) {
        return <span className="text-muted-foreground text-xs">disabled</span>;
      }
      return (
        <span
          className={cn(
            "rounded px-2 py-0.5 font-mono text-xs",
            STATUS_CLASS[row.original.currentStatus],
          )}
        >
          {row.original.currentStatus}
        </span>
      );
    },
  },
  {
    accessorKey: "intervalSeconds",
    header: "Interval",
    cell: ({ row }) => (
      <span className="font-mono tabular-nums text-xs">
        {row.original.intervalSeconds}s
      </span>
    ),
  },
  {
    accessorKey: "consecutiveFailures",
    header: "Consec. fail",
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono tabular-nums text-xs",
          row.original.consecutiveFailures > 0 && "text-warning",
        )}
      >
        {row.original.consecutiveFailures}
      </span>
    ),
  },
  {
    accessorKey: "lastCheckedAgoMs",
    header: "Last probe",
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs",
          row.original.overdue ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatAgo(row.original.lastCheckedAgoMs)}
        {row.original.overdue ? " · overdue" : ""}
      </span>
    ),
    sortingFn: (a, b) => {
      const va = a.original.lastCheckedAgoMs;
      const vb = b.original.lastCheckedAgoMs;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va - vb;
    },
  },
];

export function CheckerTelemetryTable({ rows }: { rows: CheckerRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["name", "slug"]}
      filterPlaceholder="Filter monitors…"
      emptyMessage="No monitors."
      initialPageSize={10}
    />
  );
}
