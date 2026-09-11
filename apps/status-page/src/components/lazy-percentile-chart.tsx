"use client";

import dynamic from "next/dynamic";

/** Lazy for the same reason as the latency chart — recharts is heavy. */
export const LazyPercentileChart = dynamic(
  () => import("@openmonitor/ui").then((m) => ({ default: m.PercentileChart })),
  {
    ssr: false,
    loading: () => <div className="h-[80px] w-full animate-pulse rounded-md bg-muted/40" />,
  },
);
