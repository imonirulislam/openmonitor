"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RegionLatencyPoint = {
  bucket: string;
  region: string;
  value: number;
};

/**
 * Fixed hues rather than theme vars — these have to stay distinguishable from
 * each other, which `--color-primary` and friends don't guarantee. Assigned by
 * sorted region name so a region keeps its colour across renders and matches
 * the table below the chart.
 */
const PALETTE = [
  "oklch(0.62 0.19 260)",
  "oklch(0.70 0.17 145)",
  "oklch(0.72 0.18 60)",
  "oklch(0.63 0.22 15)",
  "oklch(0.65 0.19 310)",
  "oklch(0.70 0.14 200)",
  "oklch(0.60 0.16 90)",
  "oklch(0.68 0.20 340)",
];

export function RegionLatencyChart({
  data,
  labels,
}: {
  data: RegionLatencyPoint[];
  /** Region code → display name. Falls back to the code. */
  labels?: Record<string, string>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed bg-muted/20">
        <p className="text-muted-foreground text-sm">No data in this window.</p>
      </div>
    );
  }

  const regions = [...new Set(data.map((d) => d.region))].sort();
  const colorOf = (region: string) => PALETTE[regions.indexOf(region) % PALETTE.length] as string;

  // Long → wide. A region missing from a bucket stays undefined so recharts
  // draws a gap instead of dropping the line to zero.
  const byBucket = new Map<string, Record<string, number | string>>();
  for (const d of data) {
    let row = byBucket.get(d.bucket);
    if (!row) {
      row = {
        bucket: d.bucket,
        label: new Date(d.bucket).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      byBucket.set(d.bucket, row);
    }
    row[d.region] = d.value;
  }
  const rows = [...byBucket.values()].sort((a, b) =>
    String(a.bucket).localeCompare(String(b.bucket)),
  );

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => `${v}ms`}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
            formatter={(value, name) => [`${value} ms`, labels?.[String(name)] ?? String(name)]}
          />
          <Legend
            verticalAlign="bottom"
            height={24}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => labels?.[String(value)] ?? String(value)}
          />
          {regions.map((region) => (
            <Line
              key={region}
              type="monotone"
              dataKey={region}
              stroke={colorOf(region)}
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
