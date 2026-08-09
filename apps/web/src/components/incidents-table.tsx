"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { LocalTime } from "@openmonitor/ui";
import { IncidentSeverityBadge, IncidentStatusBadge } from "./incident-badges";
import { DataTable } from "./data-table";

type Row = {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  startedAt: string;
  resolvedAt: string | null;
};

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <Link href={`/dashboard/incidents/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => <IncidentSeverityBadge severity={row.original.severity} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <IncidentStatusBadge status={row.original.status} />,
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
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
];

export function IncidentsTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      filterColumn="title"
      filterPlaceholder="Filter incidents…"
      emptyMessage="No incidents yet."
    />
  );
}
