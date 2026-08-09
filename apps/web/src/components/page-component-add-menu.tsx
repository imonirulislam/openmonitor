"use client";

import { CircleEllipsisIcon, Link2Icon, PlusIcon } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@openmonitor/ui";
import type { Monitor } from "./page-components-tree";

/**
 * "+ Add Component" dropdown — same trigger as openstatus's. Opens a menu
 * with: Add Static Component, Add Monitor Component (sub-menu listing all
 * workspace monitors with already-used ones disabled), and a placeholder
 * Third-Party item we don't implement yet.
 */
export function AddComponentMenu({
  monitors,
  usedMonitorIds,
  onStatic,
  onMonitor,
  variant = "outline",
}: {
  monitors: Monitor[];
  usedMonitorIds: Set<string>;
  onStatic: () => void;
  onMonitor: (m: Monitor) => void;
  variant?: "outline" | "ghost";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant={variant}>
          <PlusIcon /> Add Component
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onStatic}>
          <CircleEllipsisIcon className="size-4" />
          Add Static Component
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Link2Icon className="size-4" />
            Add Monitor Component
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-64 overflow-y-auto">
            {monitors.length === 0 ? (
              <DropdownMenuItem disabled>No monitors yet</DropdownMenuItem>
            ) : (
              monitors.map((m) => {
                const used = usedMonitorIds.has(m.id);
                return (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={used}
                    onClick={() => !used && onMonitor(m)}
                  >
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {used ? "used" : m.slug}
                    </span>
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Add Third-Party Component</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
