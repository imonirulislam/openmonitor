"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Stacked-area chart showing per-request timing phases (DNS / Connect / TLS /
 * TTFB / Transfer) over time. Mirrors openstatus's `ChartAreaTimingPhases`:
 * five overlapping `<Area>`s with the same `stackId` so they sum to the
 * total response time at each bucket.
 *
 * Each `Point` is one bucket (e.g., 30-min aggregate for the requested
 * percentile). Phases the probe didn't measure (TLS on plain HTTP, DNS on a
 * cached lookup) come through as 0; we render them as zero-height slices.
 */
type Point = {
  bucket: string;
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  transfer: number;
};

const PHASES = [
  { key: "dns", label: "DNS", color: "oklch(0.62 0.19 260)" }, // blue
  { key: "connect", label: "Connect", color: "oklch(0.72 0.16 160)" }, // teal-green
  { key: "tls", label: "TLS", color: "oklch(0.77 0.16 70)" }, // amber
  { key: "ttfb", label: "TTFB", color: "oklch(0.55 0.22 305)" }, // purple
  { key: "transfer", label: "Transfer", color: "oklch(0.66 0.24 15)" }, // red-pink
] as const;

export function TimingPhasesChart({
  data,
  resolutionMinutes,
}: {
  data: Point[];
  /**
   * Bucket size in minutes — drives tick stops on the X axis so the labels
   * land on real bucket boundaries (e.g. every 30 min when resolution=30)
   * instead of whatever Recharts auto-picks. Optional; if omitted Recharts
   * auto-spaces ticks based on minTickGap alone.
   */
  resolutionMinutes?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed bg-muted/20">
        <p className="text-muted-foreground text-sm">
          No phase-instrumented probes in this window yet.
        </p>
      </div>
    );
  }

  // Add a numeric `t` field (epoch ms) so the X axis can render as a true
  // time scale — gaps between points then take horizontal space proportional
  // to elapsed time, not to point index. A category axis on `label` made
  // 1-minute hops and 4-hour hops occupy the same width, which read as a
  // distorted timeline.
  const formatted = data.map((d) => ({
    ...d,
    t: new Date(d.bucket).getTime(),
  }));

  // Build explicit X-axis tick stops aligned to the resolution. We start
  // at the first bucket and step by `resolutionMinutes`, picking enough
  // stride so that the rendered chart shows ~6–10 labels regardless of
  // window length. With Recharts' `minTickGap=48` any extra ticks beyond
  // what fits get dropped automatically — but anchoring them on bucket
  // boundaries keeps the label values clean (e.g. 14:00 / 14:30 / 15:00
  // for r=30, never 14:23).
  const ticks = (() => {
    if (!resolutionMinutes || formatted.length < 2) return undefined;
    const stepMs = resolutionMinutes * 60 * 1000;
    const start = formatted[0]!.t;
    const end = formatted[formatted.length - 1]!.t;
    const totalSteps = Math.max(1, Math.round((end - start) / stepMs));
    // Aim for ~10 labels max; bigger windows get a coarser stride.
    const stride = Math.max(1, Math.ceil(totalSteps / 10));
    const out: number[] = [];
    for (let i = 0; i <= totalSteps; i += stride) {
      out.push(start + i * stepMs);
    }
    if (out[out.length - 1] !== end) out.push(end);
    return out;
  })();

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        {/*
         * margin.left intentionally 0 (not negative). A negative left margin
         * pulls the YAxis off the parent's left edge, which clipped the
         * leading digit of every tick label — "100ms" rendered as "0ms".
         * YAxis uses its own `width` for label space, so 0 is correct.
         */}
        <AreaChart data={formatted} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickMargin={6}
            tickLine={false}
            axisLine={false}
            tickFormatter={(t: number) =>
              new Date(t).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            minTickGap={48}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickMargin={4}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}ms`}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
            content={<PhaseTooltip />}
          />
          {PHASES.map((p) => (
            <Area
              key={p.key}
              type="monotone"
              dataKey={p.key}
              stackId="phases"
              stroke={p.color}
              fill={p.color}
              fillOpacity={0.4}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {/* Legend below the chart matches openstatus's footer style. */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
        {PHASES.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PhaseTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point; value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]!.payload;
  const total = point.dns + point.connect + point.tls + point.ttfb + point.transfer;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="mb-1 font-medium text-sm">
        {new Date(point.bucket).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <ul className="flex flex-col gap-1">
        {PHASES.map((p) => (
          <li
            key={p.key}
            className="flex items-center justify-between gap-6 font-mono text-xs"
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              {p.label}
            </span>
            <span className="tabular-nums">
              {(point[p.key] as number).toLocaleString()}
              <span className="ml-0.5 text-[10px] text-muted-foreground">ms</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-6 border-border border-t pt-1.5 font-medium text-xs">
        <span>Total</span>
        <span className="tabular-nums">
          {total.toLocaleString()}
          <span className="ml-0.5 text-[10px] text-muted-foreground">ms</span>
        </span>
      </div>
      {/* Suppress unused prop warning. */}
      <span className="hidden">{label}</span>
    </div>
  );
}
