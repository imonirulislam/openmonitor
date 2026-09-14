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

/** 86400 reads as "24h", not "86400s". Seconds stay in the form inputs. */
function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

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
        every {formatSeconds(row.original.expectedIntervalSeconds)}
      </span>
    ),
  },
  {
    accessorKey: "graceSeconds",
    header: "Grace",
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {formatSeconds(row.original.graceSeconds)}
      </span>
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
