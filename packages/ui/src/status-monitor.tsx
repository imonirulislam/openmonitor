import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const STATUS_DOT_COLOR: Record<string, string> = {
  up: "bg-success",
  down: "bg-destructive",
  degraded: "bg-warning",
  unknown: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<string, string> = {
  up: "Operational",
  down: "Outage",
  degraded: "Degraded",
  unknown: "Unknown",
};

export function StatusMonitor({ children, className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="status-monitor"
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function StatusMonitorHeader({
  name,
  description,
  status,
  uptime,
  right,
}: {
  name: string;
  description?: string | null;
  status: "up" | "down" | "degraded" | "unknown";
  uptime?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_COLOR[status])}
          />
          <h3 className="truncate font-medium text-sm">{name}</h3>
        </div>
        {description ? (
          <p className="mt-0.5 truncate text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-right">
        {uptime ? (
          <span className="font-mono text-muted-foreground text-xs tabular-nums">{uptime}</span>
        ) : null}
        <span className="text-foreground text-xs">{STATUS_LABEL[status]}</span>
        {right}
      </div>
    </header>
  );
}
