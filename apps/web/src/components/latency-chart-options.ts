/**
 * Shared option arrays + types for the latency chart's quantile / resolution
 * pickers. Lives in a non-`"use client"` module so the server component
 * (`apps/web/src/app/(dashboard)/monitors/[id]/page.tsx`) can import the
 * constants directly — Next.js silently strips non-component exports from a
 * `"use client"` file when imported into a server component, which surfaces
 * as "QUANTILES.find is not a function" at request time.
 */

export const QUANTILES = [
  { value: "p50", label: "P50" },
  { value: "p75", label: "P75" },
  { value: "p90", label: "P90" },
  { value: "p95", label: "P95" },
  { value: "p99", label: "P99" },
] as const;
export type Quantile = (typeof QUANTILES)[number]["value"];

export const RESOLUTIONS = [
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
  { value: "1440", label: "1 day" },
] as const;
export type Resolution = (typeof RESOLUTIONS)[number]["value"];
