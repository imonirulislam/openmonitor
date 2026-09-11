"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export type PercentilePoint = {
  bucket: string;
  p50: number;
  p90: number;
  p99: number;
};

const SERIES = [
  { key: "p50", color: "var(--chart-1)" },
  { key: "p90", color: "var(--chart-2)" },
  { key: "p99", color: "var(--chart-3)" },
] as const;

/**
 * Compact response-time percentiles for the public metrics tab. No axis
 * furniture — the numbers that matter are in the legend, and the shape is
 * what a visitor reads at this size.
 */
export function PercentileChart({
  data,
  height = 80,
}: {
  data: PercentilePoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed bg-muted/20"
        style={{ height }}
      >
        <p className="text-muted-foreground text-xs">No data yet.</p>
      </div>
    );
  }

  const last = data[data.length - 1];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span
              aria-hidden
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: s.color }}
            />
            {s.key}
            <span className="text-foreground tabular-nums">{last?.[s.key] ?? 0}ms</span>
          </span>
        ))}
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`pct-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelFormatter={(_, payload) => {
                const bucket = payload?.[0]?.payload?.bucket;
                return bucket ? new Date(bucket).toLocaleString() : "";
              }}
              formatter={(value: number, name: string) => [`${value}ms`, name]}
            />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={1.5}
                fill={`url(#pct-${s.key})`}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
