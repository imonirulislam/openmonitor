"use client";

import { Badge, Button } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { TrashIcon } from "lucide-react";
import { ChannelSheet } from "./channel-sheet";
import type { PickerItem } from "./checkbox-picker";
import { DataTable } from "./data-table";

export type ChannelRow = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  webhookUrl: string;
  /** Names of the monitors subscribed, for the Monitors column. */
  monitorNames: string[];
  subscribed: string[];
};

export function ChannelsTable({
  rows,
  monitors,
  updateAction,
  deleteAction,
}: {
  rows: ChannelRow[];
  monitors: PickerItem[];
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const columns: ColumnDef<ChannelRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground text-xs">{row.original.type}</span>
      ),
    },
    {
      accessorKey: "enabled",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? "success" : "outline"}>
          {row.original.enabled ? "enabled" : "disabled"}
        </Badge>
      ),
    },
    {
      id: "monitors",
      header: "Monitors",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.monitorNames.length === 0 ? (
          <span className="text-muted-foreground text-xs">none — posts nothing</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.original.monitorNames.map((n) => (
              <Badge key={n} variant="outline">
                {n}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <ChannelSheet
            action={updateAction}
            channel={{
              id: row.original.id,
              name: row.original.name,
              webhookUrl: row.original.webhookUrl,
              enabled: row.original.enabled,
            }}
            monitors={monitors}
            subscribed={row.original.subscribed}
          />
          <form action={deleteAction.bind(null, row.original.id)}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Delete">
              <TrashIcon />
            </Button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["name"]}
      filterPlaceholder="Filter channels…"
      emptyMessage="No channels yet. Add one above."
      paramScope="ch"
    />
  );
}
