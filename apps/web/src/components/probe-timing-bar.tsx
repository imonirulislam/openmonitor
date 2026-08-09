"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  cn,
} from "@openmonitor/ui";

const PHASES = [
  { key: "dns", label: "DNS", color: "oklch(0.62 0.19 260)" },
  { key: "connect", label: "Connect", color: "oklch(0.72 0.16 160)" },
  { key: "tls", label: "TLS", color: "oklch(0.77 0.16 70)" },
  { key: "ttfb", label: "TTFB", color: "oklch(0.55 0.22 305)" },
  { key: "transfer", label: "Transfer", color: "oklch(0.66 0.24 15)" },
] as const;

export type TimingPhases = {
  dns: number | null;
  connect: number | null;
  tls: number | null;
  ttfb: number | null;
  transfer: number | null;
};

/**
 * Compact stacked horizontal bar showing one probe's per-phase timing
 * breakdown. ~80 px wide, scales segments by their share of the probe's
 * total instrumented time. Hovering opens a HoverCard with each phase's
 * percentage + absolute ms. Mirrors openstatus's per-row Timing column.
 */
export function ProbeTimingBar({
  phases,
  className,
}: {
  phases: TimingPhases;
  className?: string;
}) {
  const totals = PHASES.map((p) => phases[p.key] ?? 0);
  const sum = totals.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return (
      <span
        aria-label="no timing data"
        className={cn(
          "inline-block h-2.5 w-20 rounded-sm bg-muted/40",
          className,
        )}
      />
    );
  }
  return (
    <HoverCard openDelay={50} closeDelay={50}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex h-2.5 w-20 cursor-default overflow-hidden rounded-sm opacity-70 transition-opacity hover:opacity-100 data-[state=open]:opacity-100",
            className,
          )}
          aria-label="timing breakdown"
        >
          {PHASES.map((p, i) => {
            const v = totals[i]!;
            if (v <= 0) return null;
            return (
              <span
                key={p.key}
                className="block h-full"
                style={{ width: `${(v / sum) * 100}%`, backgroundColor: p.color }}
              />
            );
          })}
        </span>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 w-auto rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <div className="flex flex-col gap-1">
            {PHASES.map((p, i) => {
              const v = totals[i]!;
              const pct = sum > 0 ? (v / sum) * 100 : 0;
              return (
                <div
                  key={p.key}
                  className="grid grid-cols-2 items-center gap-4 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-mono uppercase text-foreground">
                      {p.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                    <span className="font-mono text-foreground tabular-nums">
                      {v}
                      <span className="ml-0.5 text-muted-foreground">ms</span>
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="mt-1 grid grid-cols-2 items-center gap-4 border-t border-border pt-1.5 text-xs">
              <span className="font-mono uppercase text-foreground">Total</span>
              <span className="text-right font-mono text-foreground tabular-nums">
                {sum}
                <span className="ml-0.5 text-muted-foreground">ms</span>
              </span>
            </div>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
