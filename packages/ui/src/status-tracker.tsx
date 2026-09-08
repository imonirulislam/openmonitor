"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import { format } from "date-fns";
import { cn } from "./cn";

export type TrackerDayEvent = {
  type: "incident" | "maintenance";
  id: string;
  title: string;
  status: string;
  severity?: "minor" | "major" | "critical";
  autoCreated?: boolean;
  from: string;
  to: string | null;
};

export type TrackerDay = {
  date: string; // YYYY-MM-DD
  status: "up" | "down" | "degraded" | "unknown" | "no_data";
  total: number;
  ok: number;
  /** Optional per-status counts. When missing, the bar falls back to a single solid color. */
  degraded?: number;
  down?: number;
  unknown?: number;
  failed: number;
  /** Incidents/maintenances overlapping this day. Optional for back-compat. */
  events?: TrackerDayEvent[];
};

type SegmentStatus = "up" | "degraded" | "down" | "unknown" | "no_data";

const SEGMENT_COLOR: Record<SegmentStatus, string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted",
  no_data: "bg-muted",
};

// SVG fill colors — point at the same CSS variables as the Tailwind bg-*
// utilities. Using SVG `<rect>` elements (rather than absolute-positioned
// divs) guarantees pixel-perfect coordinates: every segment paints from x=0
// to x=BAR_W with the exact same width, so the bar stays aligned across
// stacked statuses regardless of how the host's flex layout distributes
// fractional widths.
const SEGMENT_FILL: Record<SegmentStatus, string> = {
  up: "var(--color-success)",
  degraded: "var(--color-warning)",
  down: "var(--color-destructive)",
  unknown: "var(--color-muted)",
  no_data: "var(--color-muted)",
};

/**
 * Build the stacked-bar segments for a day. Mirrors openstatus's `getUptime`
 * shape: each segment carries a `status` and a `height%` proportional to the
 * day's probe count. Segments stack vertically from worst-on-top so a single
 * outage probe stays visible even when most of the day was fine. Empty days
 * fall back to a single grey segment.
 */
function buildSegments(day: TrackerDay): Array<{ status: SegmentStatus; height: number }> {
  if (day.total === 0) {
    return [{ status: "no_data", height: 100 }];
  }
  const ok = day.ok;
  const degraded = day.degraded ?? 0;
  // If the API didn't surface degraded/down separately (older client), treat
  // every non-ok probe as `down` so we don't lose a segment.
  const down = day.down ?? Math.max(0, day.total - ok - degraded - (day.unknown ?? 0));
  const unknown = day.unknown ?? Math.max(0, day.total - ok - degraded - down);

  const total = day.total;
  // Worst on top so the eye reads "outage" first when scanning.
  const order: Array<[SegmentStatus, number]> = [
    ["down", down],
    ["degraded", degraded],
    ["unknown", unknown],
    ["up", ok],
  ];
  const segments = order
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, height: (count / total) * 100 }));
  if (segments.length === 0) {
    return [{ status: "no_data", height: 100 }];
  }
  return segments;
}

// Width of each day column in SVG viewBox units. The toolbar viewBox spans
// `days.length * COLUMN_W` units wide; each day occupies exactly `COLUMN_W`,
// of which `BAR_W` paints the bar and the rest is gap. Because the SVG
// scales with `preserveAspectRatio="none"`, every bar has identical width
// at the pixel level regardless of how many days there are or what the
// container's width happens to be.
const COLUMN_W = 10;
const BAR_W = 8;
const GAP = COLUMN_W - BAR_W; // 2 svg units of gap between bars

export function StatusTracker({ days, className }: { days: TrackerDay[]; className?: string }) {
  // Paint the entire 90-day tracker as ONE SVG so every day-bar shares the
  // same coordinate system — no possibility of flex/grid distributing
  // fractional widths unevenly across cells. Hover triggers are HTML
  // overlays positioned by percentage, sized identically to the SVG bars.
  const totalW = days.length * COLUMN_W;
  return (
    <div
      role="toolbar"
      aria-label="Uptime tracker"
      className={cn("relative h-[50px] w-full", className)}
    >
      <svg
        viewBox={`0 0 ${totalW} 100`}
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 h-full w-full"
      >
        {days.map((day, dayIdx) => {
          const segments = buildSegments(day);
          let yCursor = 0;
          const x = dayIdx * COLUMN_W + GAP / 2;
          return segments.map((segment, segIdx) => {
            const y = yCursor;
            yCursor += segment.height;
            return (
              <rect
                key={`${day.date}-${segment.status}-${segIdx}`}
                x={x}
                y={y}
                width={BAR_W}
                height={segment.height}
                fill={SEGMENT_FILL[segment.status]}
              />
            );
          });
        })}
      </svg>
      {/* Per-day hover triggers — invisible div overlays positioned by
          percentage so they cover exactly the same area each SVG bar paints. */}
      {days.map((day, dayIdx) => {
        const leftPct = ((dayIdx * COLUMN_W + GAP / 2) / totalW) * 100;
        const widthPct = (BAR_W / totalW) * 100;
        return (
          <HoverCard.Root key={day.date} openDelay={0} closeDelay={50}>
            <HoverCard.Trigger asChild>
              <div
                role="button"
                tabIndex={0}
                aria-label={day.date}
                className="absolute top-0 bottom-0 cursor-pointer outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <HoverCard.Content
                side="top"
                align="center"
                sideOffset={8}
                className="z-50 w-auto min-w-52 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
              >
                <div className="flex items-center gap-2 border-b pb-1">
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    {format(new Date(day.date), "LLL dd, y")}
                  </p>
                </div>
                {day.total === 0 ? (
                  <p className="mt-2 text-muted-foreground text-xs">No probes recorded.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <BreakdownRow status="up" label="Normal" count={day.ok} total={day.total} />
                    {(day.degraded ?? 0) > 0 ? (
                      <BreakdownRow
                        status="degraded"
                        label="Degraded"
                        count={day.degraded ?? 0}
                        total={day.total}
                      />
                    ) : null}
                    {(day.down ?? 0) > 0 ? (
                      <BreakdownRow
                        status="down"
                        label="Failed"
                        count={day.down ?? 0}
                        total={day.total}
                      />
                    ) : null}
                    {(day.unknown ?? 0) > 0 ? (
                      <BreakdownRow
                        status="unknown"
                        label="Unknown"
                        count={day.unknown ?? 0}
                        total={day.total}
                      />
                    ) : null}
                  </div>
                )}
                {day.events && day.events.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2">
                    {day.events.map((evt) => (
                      <EventRow key={`${evt.type}-${evt.id}`} event={evt} />
                    ))}
                  </div>
                ) : null}
              </HoverCard.Content>
            </HoverCard.Portal>
          </HoverCard.Root>
        );
      })}
    </div>
  );
}

function BreakdownRow({
  status,
  label,
  count,
  total,
}: {
  status: SegmentStatus;
  label: string;
  count: number;
  total: number;
}) {
  // Share only, no raw count. The absolute number of probes is an
  // implementation detail of the check interval — a visitor comparing two
  // monitors on 30s and 5m intervals would read wildly different totals for
  // the same availability.
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-baseline gap-3">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-sm", SEGMENT_COLOR[status])} />
        <span>{label}</span>
      </div>
      <div className="ml-auto font-mono text-muted-foreground tabular-nums">{pct.toFixed(1)}%</div>
    </div>
  );
}

function EventRow({ event }: { event: TrackerDayEvent }) {
  // Pick a color/label by event kind. Incidents show severity if present;
  // maintenances are always blue/info-ish.
  const isIncident = event.type === "incident";
  const dotClass = isIncident
    ? event.severity === "critical" || event.severity === "major"
      ? "bg-destructive"
      : "bg-warning"
    : "bg-info";
  const kindLabel = isIncident ? "Incident" : "Maintenance";
  const start = format(new Date(event.from), "LLL d, HH:mm");
  const end = event.to ? format(new Date(event.to), "LLL d, HH:mm") : "ongoing";
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={cn("mt-1 size-2 shrink-0 rounded-sm", dotClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium" title={event.title}>
            {event.title}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {kindLabel}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {start} → {end}
          {event.autoCreated ? " · auto" : ""}
        </p>
      </div>
    </div>
  );
}

export function StatusTrackerSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-[50px] w-full items-end gap-px", className)}>
      {Array.from({ length: 90 }).map((_, i) => (
        <div
          key={i}
          className="h-full w-full animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${i * 10}ms` }}
        />
      ))}
    </div>
  );
}
