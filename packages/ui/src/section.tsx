import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Page-section primitives ported from openstatus's `apps/dashboard/src/components/content/section.tsx`.
 * Pure className wrappers — no behavior. Use them to give every dashboard
 * page the same vertical rhythm: `<SectionGroup>` (centered max-width
 * container), `<Section>` (one logical block), `<SectionHeader>` (title +
 * description block), and the typography helpers underneath.
 */

export function Section({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("space-y-4", className)} {...props} />;
}

export function SectionHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/**
 * Section header that wants a trailing right-aligned slot — e.g., a
 * "Create" button. Stacks vertically below `sm`.
 */
export function SectionHeaderRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    />
  );
}

export function SectionTitle({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("font-medium text-base", className)} {...props} />;
}

export function SectionDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-mono text-muted-foreground text-sm tracking-tight", className)}
      {...props}
    />
  );
}

export function SectionGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex w-full flex-col gap-8", className)} {...props} />;
}

export function SectionGroupHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

export function SectionGroupTitle({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("font-semibold text-xl tracking-tight", className)} {...props} />;
}
