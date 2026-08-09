"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge, LocalTime } from "@openmonitor/ui";
import { DataTable } from "./data-table";

export type MaintenanceRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
};

const columns: ColumnDef<MaintenanceRow>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    accessorKey: "description",
    header: "Message",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.description ? (
        <span className="line-clamp-1 max-w-md text-muted-foreground text-xs">
          {row.original.description}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "startsAt",
    header: "Start Date",
    cell: ({ row }) => (
      <LocalTime
        date={row.original.startsAt}
        className="font-mono text-muted-foreground text-xs"
      />
    ),
    sortingFn: (a, b) =>
      Date.parse(a.original.startsAt) - Date.parse(b.original.startsAt),
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => {
      const ms =
        Date.parse(row.original.endsAt) - Date.parse(row.original.startsAt);
      const hrs = Math.round(ms / (60 * 60 * 1000));
      return <Badge variant="default">{hrs}h</Badge>;
    },
    sortingFn: (a, b) => {
      const da =
        Date.parse(a.original.endsAt) - Date.parse(a.original.startsAt);
      const db =
        Date.parse(b.original.endsAt) - Date.parse(b.original.startsAt);
      return da - db;
    },
  },
];

export function MaintenancesTable({ rows }: { rows: MaintenanceRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["title", "description"]}
      filterPlaceholder="Filter maintenances…"
      emptyMessage="No maintenances yet."
    />
  );
}
