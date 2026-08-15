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

/**
 * Renders a real <h2> so pages keep a document outline — these are section
 * headings, and screen readers navigate by them. Pass `as` when a section title
 * is doubling as the page title (list pages with no other <h1>).
 */
export function SectionTitle({
  as: Tag = "h2",
  className,
  ...props
}: ComponentProps<"h2"> & { as?: "h1" | "h2" | "h3" }) {
  return <Tag className={cn("font-medium text-base", className)} {...props} />;
}

/**
 * Smaller heading for a labelled block inside a page — a table's caption row,
 * for instance. Still an <h2>: these sit directly under the page <h1> with no
 * heading in between, so an <h3> would skip a level.
 */
export function SectionLabel({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("font-medium text-sm tracking-tight", className)} {...props} />;
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

export function SectionGroupTitle({ className, ...props }: ComponentProps<"h1">) {
  return <h1 className={cn("font-semibold text-xl tracking-tight", className)} {...props} />;
}
