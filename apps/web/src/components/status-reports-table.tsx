"use client";

import { LocalTime } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "./data-table";
import { IncidentSeverityBadge, IncidentStatusBadge } from "./incident-badges";

export type StatusReportRow = {
  id: string;
  number: number;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  startedAt: string;
  resolvedAt: string | null;
};

const columns: ColumnDef<StatusReportRow>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <Link href={`/incidents/${row.original.number}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => <IncidentSeverityBadge severity={row.original.severity} />,
    filterFn: (row, _id, value) =>
      !value || (Array.isArray(value) && value.length === 0)
        ? true
        : (value as string[]).includes(row.original.severity),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <IncidentStatusBadge status={row.original.status} />,
    filterFn: (row, _id, value) =>
      !value || (Array.isArray(value) && value.length === 0)
        ? true
        : (value as string[]).includes(row.original.status),
  },
  {
    accessorKey: "startedAt",
    header: "Started",
    cell: ({ row }) => (
      <LocalTime
        date={row.original.startedAt}
        className="font-mono text-muted-foreground text-xs"
      />
    ),
    sortingFn: (a, b) => Date.parse(a.original.startedAt) - Date.parse(b.original.startedAt),
  },
  {
    accessorKey: "resolvedAt",
    header: "Resolved",
    cell: ({ row }) =>
      row.original.resolvedAt ? (
        <LocalTime
          date={row.original.resolvedAt}
          className="font-mono text-muted-foreground text-xs"
        />
      ) : (
        <span className="font-mono text-muted-foreground text-xs">—</span>
      ),
    sortingFn: (a, b) => {
      const ta = a.original.resolvedAt ? Date.parse(a.original.resolvedAt) : 0;
      const tb = b.original.resolvedAt ? Date.parse(b.original.resolvedAt) : 0;
      return ta - tb;
    },
  },
];

export function StatusReportsTable({ rows }: { rows: StatusReportRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["title"]}
      filterPlaceholder="Filter status reports…"
      emptyMessage="No status reports."
    />
  );
}
