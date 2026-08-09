import { AlertCircleIcon, CheckIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export type StatusVariant = "success" | "degraded" | "error" | "info";

export function Status({
  children,
  className,
  variant = "success",
  ...props
}: ComponentProps<"div"> & { variant?: StatusVariant }) {
  return (
    <div
      data-variant={variant}
      data-slot="status"
      className={cn("group peer flex flex-col gap-8", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusHeader({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="status-header"
      className={cn("flex items-center gap-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusIcon({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex size-7 items-center justify-center rounded-full bg-muted text-background [&>svg]:size-4",
        "group-data-[variant=success]:bg-success",
        "group-data-[variant=degraded]:bg-warning",
        "group-data-[variant=error]:bg-destructive",
        "group-data-[variant=info]:bg-info",
        className,
      )}
      {...props}
    >
      <CheckIcon className="hidden group-data-[variant=success]:block" />
      <TriangleAlertIcon className="hidden group-data-[variant=degraded]:block" />
      <AlertCircleIcon className="hidden group-data-[variant=error]:block" />
      <WrenchIcon className="hidden group-data-[variant=info]:block" />
    </div>
  );
}

export function StatusTitle({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("font-semibold text-foreground text-lg leading-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusDescription({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("text-muted-foreground text-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function StatusContent({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      {children}
    </div>
  );
}

export function StatusEmptyState({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-center sm:px-8 sm:py-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusEmptyStateTitle({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("font-medium", className)} {...props}>
      {children}
    </div>
  );
}

export function StatusEmptyStateDescription({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("font-mono text-muted-foreground text-sm", className)} {...props}>
      {children}
    </div>
  );
}
