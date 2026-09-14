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
  /** Omit, or leave null, to opt this row out of the staleness check. */
  lastCheckedAt?: Date | null;
}

/** Same "overdue" rule `/v1/system/checker` applies to monitor freshness. */
export const STALE_INTERVAL_MULTIPLIER = 3;

/**
 * How long a region may go quiet before it stops voting.
 *
 * Derived from the monitor's own interval, not the region's: a region probes
 * every monitor on that monitor's schedule, so the same region is judged
 * against a different window per monitor. That's intended — each reduction
 * only asks "did this region report this monitor recently enough".
 */
export function staleAfterMs(intervalSeconds: number): number {
  return intervalSeconds * 1000 * STALE_INTERVAL_MULTIPLIER;
}

/** Wall clock plus the window, supplied by the caller so this stays pure. */
export interface StalenessWindow {
  now: number;
  staleAfterMs: number;
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
  window?: StalenessWindow,
): MonitorStatus {
  const reporting = rows.filter((r) => r.status !== "unknown");

  // Nothing ages these rows out, so a region that stopped reporting keeps its
  // last status forever. Left counted, one dead `up` region makes `all`
  // unreachable and can outvote a real outage under `majority`.
  //
  // A null timestamp is not evidence of staleness — seed rows and anything
  // written before the column existed have one — so those keep voting.
  const fresh =
    window === undefined
      ? reporting
      : reporting.filter(
          (r) =>
            r.lastCheckedAt == null ||
            window.now - r.lastCheckedAt.getTime() <= window.staleAfterMs,
        );

  // Falling back to `reporting` rather than returning `unknown` keeps the
  // single-region parity guarantee intact: dropping every row can only happen
  // when the clock or a backdated `checkedAt` says so, and that must not turn
  // a real status into `unknown`.
  const counted = fresh.length > 0 ? fresh : reporting;
  const total = counted.length;
  if (total === 0) return "unknown";

  const down = counted.filter((r) => r.status === "down").length;
  // Anything not `up` is unhealthy; `down` counts toward degraded too.
  const unhealthy = counted.filter((r) => r.status !== "up").length;

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
