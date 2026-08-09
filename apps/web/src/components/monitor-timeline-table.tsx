"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { LocalTime, cn } from "@openmonitor/ui";
import {
  BellRingIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { DataTable } from "./data-table";

export type TimelineKind = "ok" | "fail" | "warn" | "neutral";

export type TimelineRow = {
  id: string;
  /** Human-readable action label (e.g. "Monitor Failed", "Incident Resolved"). */
  action: string;
  /**
   * Severity bucket for the leading icon. Mirrors the visual language
   * openstatus uses: green for OK transitions, red for failures, amber for
   * degradations, neutral for everything else.
   */
  kind: TimelineKind;
  /** ISO timestamp of when the event was emitted. */
  timestamp: string;
  /** Small key/value pills shown in the Information column. */
  chips: Array<{ label: string; value: string }>;
};

const ICON_BY_ACTION_KIND: Record<
  string,
  { icon: LucideIcon; cls: string }
> = {
  // Action-name specific overrides come first so we can swap the icon
  // independently of the kind bucket (e.g. "Incident Created" uses a bell
  // even though it's a "fail" kind).
  "Incident Created": { icon: BellRingIcon, cls: "text-destructive" },
  "Incident Resolved": { icon: CircleCheckIcon, cls: "text-success" },
  "Monitor Recovered": { icon: CircleCheckIcon, cls: "text-success" },
  "Monitor Failed": { icon: CircleMinusIcon, cls: "text-destructive" },
  "Monitor Degraded": { icon: TriangleAlertIcon, cls: "text-warning" },
  "Incident Updated": { icon: BellRingIcon, cls: "text-muted-foreground" },
};

const ICON_BY_KIND: Record<TimelineKind, { icon: LucideIcon; cls: string }> = {
  ok: { icon: CircleCheckIcon, cls: "text-success" },
  fail: { icon: CircleMinusIcon, cls: "text-destructive" },
  warn: { icon: TriangleAlertIcon, cls: "text-warning" },
  neutral: { icon: BellRingIcon, cls: "text-muted-foreground" },
};

function iconFor(row: TimelineRow) {
  return ICON_BY_ACTION_KIND[row.action] ?? ICON_BY_KIND[row.kind];
}

const columns: ColumnDef<TimelineRow>[] = [
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => {
      const { icon: Icon, cls } = iconFor(row.original);
      return (
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4 shrink-0", cls)} aria-hidden />
          <span className="font-medium">{row.original.action}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "chips",
    header: "Information",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1">
        {row.original.chips.map((c, idx) => (
          <span
            key={`${c.label}-${idx}`}
            className="inline-flex items-stretch overflow-hidden rounded-md border border-border font-mono text-[10px]"
          >
            <span className="bg-muted px-1.5 py-0.5 text-muted-foreground">
              {c.label}
            </span>
            <span className="bg-card px-1.5 py-0.5 text-foreground">
              {c.value}
            </span>
          </span>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }) => (
      <LocalTime
        date={row.original.timestamp}
        format="LLL dd, y HH:mm:ss"
        className="font-mono text-muted-foreground text-xs"
      />
    ),
    sortingFn: (a, b) =>
      Date.parse(a.original.timestamp) - Date.parse(b.original.timestamp),
  },
];

export function MonitorTimelineTable({ rows }: { rows: TimelineRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      emptyMessage="No events."
      paramScope="timeline"
      pageSizeOptions={[5, 10, 25, 50]}
      initialPageSize={10}
    />
  );
}
