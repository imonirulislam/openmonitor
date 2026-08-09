"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { DataTable } from "./data-table";
import {
  RowAction,
  RowActionAction,
  RowActionSeparator,
  RowActions,
} from "./row-actions";
import { deleteStatusPage } from "~/lib/actions/status-pages";

export type StatusPageRow = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  customDomain: string | null;
  /** Pre-computed by the server so the client doesn't need NEXT_PUBLIC_STATUS_PAGE_URL. */
  publicUrl: string;
};

const columns: ColumnDef<StatusPageRow>[] = [
  {
    accessorKey: "name",
    header: "Title",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/status-pages/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "logoUrl",
    header: "Favicon",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.logoUrl ? (
        // biome-ignore lint/performance/noImgElement: small admin-only avatar
        <img src={row.original.logoUrl} alt="" className="size-5 rounded" />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    accessorKey: "slug",
    header: "Slug",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground text-xs">
        {row.original.slug}
      </span>
    ),
  },
  {
    accessorKey: "customDomain",
    header: "Domain",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.customDomain ? (
        <a
          href={row.original.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-muted-foreground text-xs hover:text-foreground"
        >
          {row.original.customDomain}
          <ExternalLinkIcon className="size-3" />
        </a>
      ) : (
        <a
          href={row.original.publicUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open public page"
          className="inline-flex text-muted-foreground hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    enableColumnFilter: false,
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div className="flex justify-end">
          <RowActions>
            <RowAction asChild>
              <Link href={`/dashboard/status-pages/${p.id}/edit`}>Edit</Link>
            </RowAction>
            <RowAction asChild>
              <Link href={`/dashboard/status-pages/${p.id}/components`}>
                Components
              </Link>
            </RowAction>
            <RowActionSeparator />
            <RowActionAction
              action={deleteStatusPage.bind(null, p.id)}
              destructive
            >
              Delete
            </RowActionAction>
          </RowActions>
        </div>
      );
    },
  },
];

export function StatusPagesTable({ rows }: { rows: StatusPageRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["name", "slug", "customDomain"]}
      filterPlaceholder="Filter status pages…"
      emptyMessage="No status pages yet."
    />
  );
}
