"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openmonitor/ui";
import { CheckIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PERIODS,
  type Period,
  QUANTILES,
  type Quantile,
  RESOLUTIONS,
  type Resolution,
} from "./latency-chart-options";

/**
 * Inline pickers shown above the timing-phases chart. Mirrors openstatus's
 * pattern: the sentence reads "The {P50} quantile within a {30 minutes}
 * resolution" with both bracketed values being clickable chips that pop a
 * dropdown of choices. State lives in the URL (`?q=` and `?r=`) so a refresh
 * keeps the picked view, and SSR can read the params and runs the right SQL.
 *
 * Constants live in `latency-chart-options.ts` (no `"use client"`) so the
 * server page can safely import them — Next strips non-component exports
 * from a client module when imported into a server component.
 */

export function LatencyChartControls({
  quantile,
  resolution,
  period,
}: {
  quantile: Quantile;
  resolution: Resolution;
  period: Period;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = (key: "q" | "r" | "p", value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === defaultValue) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const quantileLabel = QUANTILES.find((q) => q.value === quantile)?.label ?? "P50";
  const resolutionLabel = RESOLUTIONS.find((r) => r.value === resolution)?.label ?? "30 minutes";
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "last day";
  const isDefault = quantile === "p50" && resolution === "30" && period === "24h";

  return (
    <p className="font-mono text-muted-foreground text-sm">
      The{" "}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-medium text-foreground text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {quantileLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-32">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Quantile
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {QUANTILES.map((q) => (
            <DropdownMenuItem
              key={q.value}
              onSelect={() => setParam("q", q.value, "p50")}
              className="flex items-center justify-between gap-2"
            >
              <span>{q.label}</span>
              {q.value === quantile ? <CheckIcon className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>{" "}
      quantile within a{" "}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-medium text-foreground text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {resolutionLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Resolution
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {RESOLUTIONS.map((r) => (
            <DropdownMenuItem
              key={r.value}
              onSelect={() => setParam("r", r.value, "30")}
              className="flex items-center justify-between gap-2"
            >
              <span>{r.label}</span>
              {r.value === resolution ? <CheckIcon className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>{" "}
      resolution over the{" "}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 font-medium text-foreground text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {periodLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuLabel className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Period
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PERIODS.map((p) => (
            <DropdownMenuItem
              key={p.value}
              onSelect={() => setParam("p", p.value, "24h")}
              className="flex items-center justify-between gap-2"
            >
              <span>{p.label}</span>
              {p.value === period ? <CheckIcon className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isDefault ? null : (
        <>
          {" "}
          <button
            type="button"
            onClick={() => router.replace(pathname, { scroll: false })}
            className="text-muted-foreground text-xs underline hover:text-foreground"
          >
            Reset
          </button>
        </>
      )}
    </p>
  );
}
