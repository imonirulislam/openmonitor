import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Tinted metric card. Variants color the border + soft background, and
 * children inherit the variant via `data-variant=` so MetricCardHeader can
 * pick the matching foreground color. Ported from openstatus's
 * `apps/dashboard/src/components/metric/metric-card.tsx`.
 */
const metricCardVariants = cva(
  "flex flex-col gap-1 rounded-lg border px-3 py-2 text-card-foreground",
  {
    variants: {
      variant: {
        default: "border-input bg-card",
        ghost: "border-transparent",
        destructive: "border-destructive/80 bg-destructive/10",
        success: "border-success/80 bg-success/10",
        warning: "border-warning/80 bg-warning/10",
        info: "border-info/80 bg-info/10",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type MetricCardVariant = NonNullable<
  VariantProps<typeof metricCardVariants>["variant"]
>;

export function MetricCard({
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof metricCardVariants>) {
  return (
    <div
      data-variant={variant}
      className={cn("group", metricCardVariants({ variant, className }))}
      {...props}
    />
  );
}

/**
 * Clickable variant of MetricCard — used as a filter chip on listing pages.
 * Active state is whatever the caller wants; we just render a button.
 */
export function MetricCardButton({
  className,
  variant,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof metricCardVariants>) {
  return (
    <button
      type="button"
      data-variant={variant}
      className={cn(
        "group w-full cursor-pointer rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        metricCardVariants({ variant, className }),
      )}
      {...props}
    />
  );
}

export function MetricCardGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
        className,
      )}
      {...props}
    />
  );
}

export function MetricCardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-muted-foreground",
        "group-data-[variant=destructive]:text-destructive",
        "group-data-[variant=success]:text-success",
        "group-data-[variant=warning]:text-warning",
        "group-data-[variant=info]:text-info",
        className,
      )}
      {...props}
    />
  );
}

export function MetricCardTitle({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-medium font-mono text-sm tracking-tight", className)}
      {...props}
    />
  );
}

export function MetricCardValue({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-medium text-foreground text-xl tabular-nums", className)}
      {...props}
    />
  );
}
