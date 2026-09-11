import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Placeholder block sized to the content it stands in for. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
