import type { ComponentProps } from "react";
import { cn } from "./cn";

const TONE = {
  info: "border-info/30 bg-info/5 text-foreground",
  warning: "border-warning/30 bg-warning/5 text-foreground",
  error: "border-destructive/30 bg-destructive/5 text-foreground",
} as const;

/** Inline callout for advice or a constraint that isn't a validation error. */
export function Note({
  tone = "info",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof TONE }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        TONE[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
