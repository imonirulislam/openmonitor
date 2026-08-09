"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  bucket: string;
  avg: number;
  p95: number;
  ok: number;
  total: number;
};

export function LatencyChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed bg-muted/20">
        <p className="text-muted-foreground text-sm">No data in this window.</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <AreaChart data={formatted} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="latency-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.62 0.19 260)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.62 0.19 260)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickMargin={6}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickMargin={4}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}ms`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
            formatter={(value: number, key: string) => {
              const label = key === "avg" ? "avg" : key === "p95" ? "p95" : key;
              return [`${value} ms`, label];
            }}
          />
          <Area
            type="monotone"
            dataKey="avg"
            stroke="oklch(0.62 0.19 260)"
            strokeWidth={1.5}
            fill="url(#latency-fill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="p95"
            stroke="oklch(0.77 0.16 70)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
