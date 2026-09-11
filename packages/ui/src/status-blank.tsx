import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Empty states that show the shape of what's missing.
 *
 * A bare "nothing here" line reads as a broken page; a ghost of the thing that
 * would fill it reads as a page waiting for content. Ported from openstatus's
 * status-blank blocks.
 */
export function StatusBlank({
  title,
  description,
  action,
  className,
  ...props
}: ComponentProps<"div"> & { title: string; description: string; action?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-center sm:px-8 sm:py-6",
        className,
      )}
      {...props}
    >
      {/* Three stacked ghosts, the back two peeking out above the front one. */}
      <div className="relative mt-8 flex w-full flex-col items-center justify-center">
        <GhostMonitor className="-top-16 absolute scale-60 opacity-50" />
        <GhostMonitor className="-top-8 absolute scale-80 opacity-80" />
        <GhostMonitor />
      </div>
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <div className="font-mono text-muted-foreground text-sm">{description}</div>
      </div>
      {action}
    </div>
  );
}

function GhostMonitor({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex w-full max-w-xs flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-border/70 bg-background px-3 py-2",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-4">
        <div className="size-3 rounded-sm bg-accent/60" />
        <div className="flex flex-row gap-1">
          <div className="h-3 w-8 rounded-sm bg-accent/60" />
          <div className="h-3 w-8 rounded-sm bg-accent/60" />
          <div className="h-3 w-8 rounded-sm bg-accent/60" />
        </div>
        <div className="h-3 w-8 rounded-sm bg-accent/60" />
      </div>

      <div className="flex w-full flex-col items-center justify-between gap-1">
        <div className="flex w-full flex-row gap-1">
          <div className="h-3 w-8 rounded-sm bg-accent" />
          <div className="h-3 w-12 rounded-sm bg-accent" />
          <div className="h-3 w-10 rounded-sm bg-accent" />
        </div>
        <div className="flex w-full flex-row items-end gap-0.5">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={`bar-${i}`}
              className={cn(
                "h-12 flex-1 rounded-sm bg-accent",
                (i === 10 || i === 20) && "h-8",
                i === 25 && "h-10",
              )}
            />
          ))}
        </div>
      </div>

      {/* Fades the ghost into the page rather than ending it with a hard edge. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-background" />
    </div>
  );
}
