"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openmonitor/ui";
import { Loader2Icon, MoreHorizontalIcon } from "lucide-react";
import { type ReactNode, useTransition } from "react";

/**
 * 3-dot row-actions menu for dashboard tables.
 *
 * Two child component variants:
 *   - `<RowAction>` — re-export of `DropdownMenuItem`. Use for navigation
 *     items (`asChild` + `<Link>`).
 *   - `<RowActionAction>` — calls a server action via `onSelect`. Use this
 *     for delete/toggle/etc. instead of `<form action=…><button type=submit>`.
 *
 * Why the second component exists: Radix's DropdownMenuItem closes the menu
 * on click, which unmounts any descendant `<form>`, which causes Next/React
 * to log "Form submission canceled because the form is not connected" and
 * silently drop the submit. Calling the server action directly from
 * `onSelect` sidesteps the DOM-connection requirement entirely.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Open menu">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Calls a bound server action (with no extra arguments — bind any params
 * upstream via `.bind(null, …)`). Shows an inline spinner while the action
 * is in flight.
 */
export function RowActionAction({
  action,
  children,
  destructive,
  disabled,
}: {
  action: () => void | Promise<void>;
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenuItem
      disabled={pending || disabled}
      onSelect={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await action();
        });
      }}
      className={cn("flex w-full items-center gap-2", destructive && "text-destructive")}
    >
      {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
      <span className="flex-1 text-left">{children}</span>
    </DropdownMenuItem>
  );
}

export { DropdownMenuItem as RowAction, DropdownMenuSeparator as RowActionSeparator };
