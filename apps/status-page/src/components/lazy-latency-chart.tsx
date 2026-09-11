"use client";

import dynamic from "next/dynamic";

/** Lazy so recharts stays out of the shared bundle every page pays for. */
export const LazyLatencyChart = dynamic(
  () => import("@openmonitor/ui").then((m) => ({ default: m.LatencyChart })),
  {
    ssr: false,
    loading: () => <div className="h-[220px] w-full animate-pulse rounded-md bg-muted/40" />,
  },
);
