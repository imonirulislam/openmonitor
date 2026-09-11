"use client";

import { Badge, LocalTime } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";
import { RowActionAction, RowActionSeparator, RowActions } from "./row-actions";

export type MaintenanceRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
};

const BASE_COLUMNS: ColumnDef<MaintenanceRow>[] = [
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
      <LocalTime date={row.original.startsAt} className="font-mono text-muted-foreground text-xs" />
    ),
    sortingFn: (a, b) => Date.parse(a.original.startsAt) - Date.parse(b.original.startsAt),
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => {
      const ms = Date.parse(row.original.endsAt) - Date.parse(row.original.startsAt);
      const hrs = Math.round(ms / (60 * 60 * 1000));
      return <Badge variant="default">{hrs}h</Badge>;
    },
    sortingFn: (a, b) => {
      const da = Date.parse(a.original.endsAt) - Date.parse(a.original.startsAt);
      const db = Date.parse(b.original.endsAt) - Date.parse(b.original.startsAt);
      return da - db;
    },
  },
];

/**
 * Shared by the status page's maintenances tab and the workspace-wide list.
 * The workspace list owns the windows, so it gets status and row actions; the
 * page tab is a read-only view of what's attached to that page.
 */
export function MaintenancesTable({
  rows,
  showStatus = false,
  cancelAction,
  deleteAction,
  paramScope,
}: {
  rows: MaintenanceRow[];
  showStatus?: boolean;
  cancelAction?: (id: string) => Promise<void>;
  deleteAction?: (id: string) => Promise<void>;
  paramScope?: string;
}) {
  const columns: ColumnDef<MaintenanceRow>[] = [...BASE_COLUMNS];

  if (showStatus) {
    columns.splice(1, 0, {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant="info">{row.original.status}</Badge>,
    });
  }

  if (cancelAction || deleteAction) {
    columns.push({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const open = row.original.status !== "cancelled" && row.original.status !== "completed";
        return (
          <div className="flex justify-end">
            <RowActions>
              {cancelAction && open ? (
                <>
                  <RowActionAction action={cancelAction.bind(null, row.original.id)}>
                    Cancel
                  </RowActionAction>
                  <RowActionSeparator />
                </>
              ) : null}
              {deleteAction ? (
                <RowActionAction action={deleteAction.bind(null, row.original.id)} destructive>
                  Delete
                </RowActionAction>
              ) : null}
            </RowActions>
          </div>
        );
      },
    });
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["title", "description"]}
      filterPlaceholder="Filter maintenances…"
      emptyMessage="No maintenance windows scheduled."
      paramScope={paramScope}
    />
  );
}
