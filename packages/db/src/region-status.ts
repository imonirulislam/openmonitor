import type { monitorRegionPolicyEnum } from "./schema";
import type { MonitorStatus } from "./types";

export type RegionPolicy = (typeof monitorRegionPolicyEnum.enumValues)[number];

/**
 * Ordered for UI, least strict first. Mirrors the pgEnum.
 *
 * Plain `as const` with no `satisfies`: the readonly-array constraint widens the
 * tuple enough that `z.enum()` stops inferring literals, which silently degrades
 * every type derived from the form schema. Same shape as `monitorKinds`.
 */
export const REGION_POLICIES = ["any", "majority", "all"] as const;

/** The slice of a `monitor_region_status` row the reduction needs. */
export interface RegionStatusRow {
  region: string;
  status: MonitorStatus;
}

/**
 * Reduce per-region statuses to the monitor's single global status.
 *
 * Regions sitting at `unknown` — never probed, or a location that was disabled
 * before it ever reported — are **excluded from the denominator**. Counting them
 * would mean adding a new region instantly drags healthy monitors toward
 * `unknown`, and would make `majority` depend on how many locations exist rather
 * than how many actually report.
 *
 * If nothing is reporting, the monitor is `unknown`.
 *
 * `degraded` reduces the same way as `down` but ranks below it: a region that is
 * `down` is also not-healthy, so it counts toward a degraded majority.
 *
 * All three policies agree when exactly one region reports, which is what makes
 * this a no-op for single-region installs regardless of the configured policy.
 */
export function reduceRegionStatuses(
  rows: readonly RegionStatusRow[],
  policy: RegionPolicy,
): MonitorStatus {
  const reporting = rows.filter((r) => r.status !== "unknown");
  const total = reporting.length;
  if (total === 0) return "unknown";

  const down = reporting.filter((r) => r.status === "down").length;
  // Anything not `up` is unhealthy; `down` counts toward degraded too.
  const unhealthy = reporting.filter((r) => r.status !== "up").length;

  switch (policy) {
    case "any":
      if (down >= 1) return "down";
      return unhealthy >= 1 ? "degraded" : "up";

    case "majority":
      if (down * 2 > total) return "down";
      return unhealthy * 2 > total ? "degraded" : "up";

    case "all":
      if (down === total) return "down";
      return unhealthy === total ? "degraded" : "up";
  }
}
