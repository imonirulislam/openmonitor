"use client";

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  useSidebar,
} from "@openmonitor/ui";
import { switchWorkspace } from "~/lib/actions/workspace";

export type WorkspaceOption = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

/**
 * Workspace switcher — sits at the top of the sidebar. When the sidebar is
 * collapsed, shrinks to a circular trigger; when expanded, shows the current
 * workspace name with a dropdown caret.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [pending, startTransition] = useTransition();
  // Tracks which workspace is currently being switched to so we can swap its
  // avatar for a spinner. `pending` from useTransition gates all-item
  // disabling; this gives us per-row "loading" state too.
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
            collapsed ? "justify-center" : "w-full",
          )}
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded bg-foreground font-semibold text-background text-xs uppercase"
          >
            {(current?.name ?? "?").slice(0, 1)}
          </span>
          {!collapsed ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-xs leading-none">
                  {current?.name ?? "No workspace"}
                </span>
                <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {current?.role ?? ""}
                </span>
              </span>
              <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map((w) => {
          const isCurrent = w.id === current?.id;
          const isPending = pendingId === w.id;
          return (
            <DropdownMenuItem
              key={w.id}
              disabled={pending || isCurrent}
              onSelect={(e) => {
                // Stop Radix from closing the menu before our action runs —
                // the menu's unmount kills the inner form, hence the
                // "Form submission canceled because the form is not connected"
                // error we hit when this was a `<form action=…>`. Calling the
                // server action directly (it `redirect()`s itself) sidesteps
                // the form-DOM dependency entirely.
                e.preventDefault();
                setPendingId(w.id);
                startTransition(async () => {
                  await switchWorkspace(w.id);
                });
              }}
              className="flex w-full items-center gap-2"
            >
              {isPending ? (
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-semibold text-foreground text-[10px] uppercase"
                >
                  {w.name.slice(0, 1)}
                </span>
              )}
              <span className="flex-1 truncate text-sm">{w.name}</span>
              {isCurrent && !isPending ? (
                <CheckIcon className="size-3.5 text-foreground" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard/settings/workspace?new=1" className="flex items-center gap-2">
            <PlusIcon className="size-3.5" />
            New workspace
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
