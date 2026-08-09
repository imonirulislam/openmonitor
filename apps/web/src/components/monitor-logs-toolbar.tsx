"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openmonitor/ui";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";

/**
 * Filter chips above the per-monitor logs table. Mirrors openstatus's
 * `controls-search` group: status multi-select, region multi-select, and
 * a reset button. State is URL-driven (nuqs) so a refresh / shared link
 * preserves the active filters; the parent component reads the same URL
 * values to pre-filter rows before they reach the DataTable.
 */
export const STATUS_OPTIONS = [
  { value: "up", label: "Up" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Down" },
  { value: "unknown", label: "Unknown" },
] as const;

export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

export function MonitorLogsToolbar({ regions }: { regions: string[] }) {
  const [status, setStatus] = useQueryState(
    "status",
    parseAsArrayOf(parseAsString).withOptions({
      history: "push",
      shallow: true,
    }),
  );
  const [region, setRegion] = useQueryState(
    "region",
    parseAsArrayOf(parseAsString).withOptions({
      history: "push",
      shallow: true,
    }),
  );

  const activeStatus = new Set(status ?? []);
  const activeRegion = new Set(region ?? []);
  const hasFilter = activeStatus.size > 0 || activeRegion.size > 0;

  const toggleStatus = (v: string) => {
    const next = new Set(activeStatus);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    void setStatus(next.size === 0 ? null : [...next]);
  };
  const toggleRegion = (v: string) => {
    const next = new Set(activeRegion);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    void setRegion(next.size === 0 ? null : [...next]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu
        label="Status"
        activeCount={activeStatus.size}
        onClear={
          activeStatus.size > 0
            ? () => {
                void setStatus(null);
              }
            : undefined
        }
      >
        {STATUS_OPTIONS.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={activeStatus.has(opt.value)}
            onCheckedChange={() => toggleStatus(opt.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </FilterMenu>

      <FilterMenu
        label="Region"
        activeCount={activeRegion.size}
        onClear={
          activeRegion.size > 0
            ? () => {
                void setRegion(null);
              }
            : undefined
        }
      >
        {regions.length === 0 ? (
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            No regions in window
          </DropdownMenuLabel>
        ) : (
          regions.map((r) => (
            <DropdownMenuCheckboxItem
              key={r}
              checked={activeRegion.has(r)}
              onCheckedChange={() => toggleRegion(r)}
              onSelect={(e) => e.preventDefault()}
            >
              {r}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </FilterMenu>

      {hasFilter ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            void setStatus(null);
            void setRegion(null);
          }}
        >
          <XIcon className="size-3" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function FilterMenu({
  label,
  activeCount,
  onClear,
  children,
}: {
  label: string;
  activeCount: number;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 text-xs", activeCount > 0 && "border-primary/50")}
        >
          {label}
          {activeCount > 0 ? (
            <span className="ml-1 rounded-sm bg-primary/15 px-1 font-mono text-[10px] text-primary">
              {activeCount}
            </span>
          ) : null}
          <ChevronDownIcon className="ml-1 size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
        {onClear ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={onClear}
              className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-muted-foreground text-xs hover:text-foreground"
            >
              <XIcon className="size-3" /> Clear
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
