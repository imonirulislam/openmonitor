"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  LocalTime,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@openmonitor/ui";
import { DataTable } from "./data-table";

export type AuditRow = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  targetHref: string | null;
  metadata: string | null; // pre-stringified for plain text search
};

const ACTION_VARIANT: Record<string, "success" | "destructive" | "warning" | "default"> = {
  created: "success",
  updated: "default",
  resolved: "success",
  deleted: "destructive",
};

function actionVariant(action: string) {
  for (const [key, variant] of Object.entries(ACTION_VARIANT)) {
    if (action.includes(key)) return variant;
  }
  return "default" as const;
}

export function AuditLogsTable({ rows }: { rows: AuditRow[] }) {
  // The selected row drives the detail Sheet. Storing the row itself (not just
  // its id) means closing + reopening doesn't have to look it up.
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const columns: ColumnDef<AuditRow>[] = [
    {
      accessorKey: "createdAt",
      header: "When",
      cell: ({ row }) => (
        <LocalTime
          date={row.original.createdAt}
          className="font-mono text-muted-foreground text-xs"
        />
      ),
    },
    {
      accessorKey: "actorEmail",
      header: "Actor",
      cell: ({ row }) => <span className="text-xs">{row.original.actorEmail ?? "—"}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <Badge variant={actionVariant(row.original.action)}>{row.original.action}</Badge>
      ),
    },
    {
      id: "target",
      accessorFn: (r) => `${r.targetType} ${r.targetLabel}`,
      header: "Target",
      cell: ({ row }) => (
        <span className="text-xs">
          <span className="font-mono text-muted-foreground">{row.original.targetType}</span>{" "}
          {row.original.targetHref ? (
            <Link
              href={row.original.targetHref}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.targetLabel}
            </Link>
          ) : (
            row.original.targetLabel
          )}
        </span>
      ),
    },
    {
      accessorKey: "metadata",
      header: "Details",
      cell: ({ row }) => (
        <span className="block max-w-[260px] truncate font-mono text-muted-foreground text-xs">
          {row.original.metadata ?? "—"}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelected(row.original);
          }}
          className="text-foreground text-xs hover:underline"
        >
          View
        </button>
      ),
      enableSorting: false,
    },
  ];

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        searchFields={["actorEmail", "action", "targetLabel", "targetType", "metadata"]}
        filterPlaceholder="Search actor, action, target, or details…"
        emptyMessage="No actions recorded yet."
        initialPageSize={10}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? <AuditDetail row={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AuditDetail({ row }: { row: AuditRow }) {
  const prettyMetadata = (() => {
    if (!row.metadata) return null;
    try {
      return JSON.stringify(JSON.parse(row.metadata), null, 2);
    } catch {
      return row.metadata;
    }
  })();

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
        </SheetTitle>
        <SheetDescription>
          <LocalTime
            date={row.createdAt}
            format="LLL dd, y · HH:mm:ss"
            className="font-mono"
          />
        </SheetDescription>
      </SheetHeader>

      <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <Detail label="Actor" value={row.actorEmail ?? "—"} />
        <Detail label="Target type" value={row.targetType} mono />
        <Detail
          label="Target"
          value={
            row.targetHref ? (
              <Link href={row.targetHref} className="hover:underline">
                {row.targetLabel}
              </Link>
            ) : (
              row.targetLabel
            )
          }
        />
        <Detail
          label="Target ID"
          value={row.targetId ?? "—"}
          mono
          className="break-all"
        />
        <Detail label="Audit ID" value={row.id} mono className="break-all" />
      </dl>

      {prettyMetadata ? (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Metadata
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {prettyMetadata}
          </pre>
        </div>
      ) : null}
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <>
      <dt className="col-span-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`col-span-2 ${mono ? "font-mono text-xs" : ""} ${className}`}>{value}</dd>
    </>
  );
}
