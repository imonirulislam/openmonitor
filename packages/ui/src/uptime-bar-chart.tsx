"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type UptimeBar = {
  bucket: string;
  ok: number;
  degraded: number;
  down: number;
};

const SERIES = [
  { key: "ok", label: "Success", color: "var(--color-success)" },
  { key: "down", label: "Error", color: "var(--color-destructive)" },
  { key: "degraded", label: "Degraded", color: "var(--color-warning)" },
] as const;

/** Probes per bucket, stacked by outcome. Height is the count, so a short bar is a sparse one. */
export function UptimeBarChart({ data, empty }: { data: UptimeBar[]; empty?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[130px] items-center justify-center rounded-md border border-dashed bg-muted/20">
        <p className="text-muted-foreground text-sm">
          {empty ?? "No probe results in this window."}
        </p>
      </div>
    );
  }

  const rows = data.map((d) => ({
    ...d,
    label: new Date(d.bucket).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <div className="h-[130px] w-full">
      <ResponsiveContainer>
        <BarChart data={rows} barCategoryGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis
            orientation="right"
            domain={[0, "dataMax"]}
            allowDecimals={false}
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
          />
          <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 12 }} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
