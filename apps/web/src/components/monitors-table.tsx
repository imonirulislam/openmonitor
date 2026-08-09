"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { LocalTime, cn } from "@openmonitor/ui";
import { deleteMonitor, toggleMonitorEnabled } from "~/lib/actions/monitors";
import { DataTable } from "./data-table";
import {
  RowAction,
  RowActionAction,
  RowActionSeparator,
  RowActions,
} from "./row-actions";

type Row = {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  intervalSeconds: number;
  enabled: boolean;
  currentStatus: "up" | "down" | "degraded" | "unknown";
  lastCheckedAt: string | null;
  lastIncidentAt: string | null;
  p95Ms: number | null;
};

const STATUS_LABEL: Record<Row["currentStatus"], string> = {
  up: "Operational",
  down: "Outage",
  degraded: "Degraded",
  unknown: "Unknown",
};

const STATUS_COLOR: Record<Row["currentStatus"], string> = {
  up: "text-success",
  down: "text-destructive",
  degraded: "text-warning",
  unknown: "text-muted-foreground",
};

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/monitors/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "url",
    header: "Endpoint",
    cell: ({ row }) => (
      <span className="block max-w-[280px] truncate font-mono text-muted-foreground text-xs">
        {row.original.url ?? "—"}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "currentStatus",
    header: "Status",
    cell: ({ row }) => (
      <span className={cn("font-mono text-sm", STATUS_COLOR[row.original.currentStatus])}>
        {STATUS_LABEL[row.original.currentStatus]}
      </span>
    ),
    filterFn: (row, _id, value) =>
      !value || value.length === 0 ? true : value.includes(row.original.currentStatus),
  },
  {
    accessorKey: "p95Ms",
    header: "p95 (24h)",
    cell: ({ row }) =>
      row.original.p95Ms != null ? (
        <span className="font-mono text-xs tabular-nums">{row.original.p95Ms} ms</span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
    sortingFn: (a, b) => {
      const pa = a.original.p95Ms;
      const pb = b.original.p95Ms;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    },
  },
  {
    accessorKey: "intervalSeconds",
    header: "Interval",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground text-xs">
        {row.original.intervalSeconds}s
      </span>
    ),
  },
  {
    accessorKey: "lastCheckedAt",
    header: "Last checked",
    cell: ({ row }) =>
      row.original.lastCheckedAt ? (
        <LocalTime
          date={row.original.lastCheckedAt}
          className="font-mono text-muted-foreground text-xs"
        />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "lastIncidentAt",
    header: "Last incident",
    cell: ({ row }) =>
      row.original.lastIncidentAt ? (
        <LocalTime
          date={row.original.lastIncidentAt}
          className="font-mono text-muted-foreground text-xs"
          format="LLL d, y"
        />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    enableColumnFilter: false,
    cell: ({ row }) => {
      const m = row.original;
      return (
        <div className="flex justify-end">
          <RowActions>
            <RowAction asChild>
              <Link href={`/dashboard/monitors/${m.id}/edit`}>Edit</Link>
            </RowAction>
            <RowAction asChild>
              <Link href={`/dashboard/monitors/${m.id}/logs`}>View logs</Link>
            </RowAction>
            <RowActionSeparator />
            <RowActionAction
              action={toggleMonitorEnabled.bind(null, m.id, !m.enabled)}
            >
              {m.enabled ? "Disable" : "Enable"}
            </RowActionAction>
            <RowActionSeparator />
            <RowActionAction action={deleteMonitor.bind(null, m.id)} destructive>
              Delete
            </RowActionAction>
          </RowActions>
        </div>
      );
    },
  },
];

export function MonitorsTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      filterColumn="name"
      filterPlaceholder="Filter monitors…"
      emptyMessage="No monitors yet."
    />
  );
}
