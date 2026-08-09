"use client";

import { Button, Card, cn, Input, Select } from "@openmonitor/ui";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Generic data table — sortable headers, pagination, and either:
 *   - per-column filter via `filterColumn` (a single tanstack column filter)
 *   - global search via `searchFields` (matches the query against any of the
 *     listed top-level row fields, case-insensitive substring)
 *
 * Server pages remain server components; this is the client island they hand
 * data to.
 */
export function DataTable<TData, TValue>({
  data,
  columns,
  filterColumn,
  searchFields,
  filterPlaceholder = "Filter…",
  emptyMessage = "No results.",
  initialPageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  paramScope,
  toolbar,
}: {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  filterColumn?: keyof TData & string;
  /** When set, renders a single search input that matches against any of these row fields. */
  searchFields?: Array<keyof TData & string>;
  filterPlaceholder?: string;
  emptyMessage?: string;
  initialPageSize?: number;
  /** Page-size choices shown in the footer dropdown. Pass `null` to hide. */
  pageSizeOptions?: number[] | null;
  /**
   * Optional prefix for the `?page` / `?pageSize` URL params. When set,
   * the params become `?{scope}Page` / `?{scope}PageSize` so multiple
   * DataTables on the same page don't fight over the same query keys.
   */
  paramScope?: string;
  toolbar?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalQuery, setGlobalQuery] = useState("");

  // Pagination state lives in the URL so refresh / shared links land on the
  // same view. `parseAsInteger` defaults to null when missing or invalid; we
  // coerce to safe defaults below.
  const pageKey = paramScope ? `${paramScope}Page` : "page";
  const pageSizeKey = paramScope ? `${paramScope}PageSize` : "pageSize";
  const [pageParam, setPageParam] = useQueryState(
    pageKey,
    parseAsInteger.withOptions({ history: "push", shallow: true }),
  );
  const [pageSizeParam, setPageSizeParam] = useQueryState(
    pageSizeKey,
    parseAsInteger.withOptions({ history: "replace", shallow: true }),
  );
  const pageIndex = pageParam && pageParam > 0 ? pageParam - 1 : 0;
  const pageSize = pageSizeParam && pageSizeParam > 0 ? pageSizeParam : initialPageSize;

  const filteredData = useMemo(() => {
    if (!searchFields || !globalQuery.trim()) return data;
    const q = globalQuery.trim().toLowerCase();
    return data.filter((row) =>
      searchFields.some((f) => {
        const v = (row as Record<string, unknown>)[f];
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  }, [data, searchFields, globalQuery]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination: { pageIndex, pageSize },
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      // Keep ?page out of the URL when it's page 1; pageSize is omitted
      // when it equals the component default. Keeps URLs short for the
      // common case.
      void setPageParam(next.pageIndex === 0 ? null : next.pageIndex + 1);
      void setPageSizeParam(next.pageSize === initialPageSize ? null : next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex flex-col gap-3">
      {(filterColumn || searchFields || toolbar) && (
        <div className="flex items-center justify-between gap-2">
          {searchFields ? (
            <Input
              placeholder={filterPlaceholder}
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              className="max-w-xs"
            />
          ) : filterColumn ? (
            <Input
              placeholder={filterPlaceholder}
              value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
              onChange={(e) => table.getColumn(filterColumn)?.setFilterValue(e.target.value)}
              className="max-w-xs"
            />
          ) : (
            <div />
          )}
          {toolbar}
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-muted-foreground text-xs">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th key={header.id} className="px-4 py-3 font-medium">
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            dir && "text-foreground",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === "asc" ? (
                            <ChevronUpIcon className="size-3" />
                          ) : dir === "desc" ? (
                            <ChevronDownIcon className="size-3" />
                          ) : (
                            <ChevronsUpDownIcon className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground text-sm"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Always-visible pagination chrome: row count + page-size selector on
          the left, 4 nav buttons on the right. First/Last are hidden below lg
          to save space. */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
        <div className="flex items-center gap-3">
          <span>
            {table.getFilteredRowModel().rows.length} of{" "}
            {table.getPreFilteredRowModel().rows.length} row
            {table.getPreFilteredRowModel().rows.length === 1 ? "" : "s"}
            {table.getPageCount() > 1
              ? ` · page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`
              : ""}
            .
          </span>
          {pageSizeOptions && pageSizeOptions.length > 1 ? (
            <label className="flex items-center gap-1.5">
              <span>Rows per page</span>
              <Select
                value={String(table.getState().pagination.pageSize)}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="h-7 w-auto py-0 text-xs"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to first page"
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Go to next page"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Go to last page"
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
