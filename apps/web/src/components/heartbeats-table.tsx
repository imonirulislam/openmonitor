"use client";

import { Badge, LocalTime } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTable } from "./data-table";

export type HeartbeatRow = {
  id: string;
  slug: string;
  name: string;
  currentStatus: "up" | "down" | "unknown" | "degraded";
  expectedIntervalSeconds: number;
  graceSeconds: number;
  lastPingAt: string | null;
};

const STATUS_VARIANT: Record<HeartbeatRow["currentStatus"], "success" | "destructive" | "default"> =
  {
    up: "success",
    down: "destructive",
    degraded: "default",
    unknown: "default",
  };

const columns: ColumnDef<HeartbeatRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link href={`/heartbeats/${row.original.slug}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "slug",
    header: "Slug",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground text-xs">{row.original.slug}</span>
    ),
  },
  {
    accessorKey: "currentStatus",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.currentStatus]}>
        {row.original.currentStatus}
      </Badge>
    ),
  },
  {
    accessorKey: "expectedIntervalSeconds",
    header: "Expected",
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        every {row.original.expectedIntervalSeconds}s
      </span>
    ),
  },
  {
    accessorKey: "graceSeconds",
    header: "Grace",
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{row.original.graceSeconds}s</span>
    ),
  },
  {
    accessorKey: "lastPingAt",
    header: "Last ping",
    cell: ({ row }) =>
      row.original.lastPingAt ? (
        <span className="text-xs">
          <LocalTime date={row.original.lastPingAt} format="LLL d, HH:mm" />
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">never</span>
      ),
  },
];

export function HeartbeatsTable({ rows }: { rows: HeartbeatRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["name", "slug"]}
      filterPlaceholder="Filter heartbeats…"
      emptyMessage="No heartbeats yet."
      paramScope="hb"
    />
  );
}
