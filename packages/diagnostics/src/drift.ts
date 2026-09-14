/**
 * Finds monitors that got slower without ever tripping an alert.
 *
 * A threshold catches a cliff. This catches the ramp — the p95 that went from
 * 180ms to 340ms over a month, which nothing pages on and nobody notices until
 * someone complains.
 */

export type DriftSample = {
  monitorId: string;
  recentP95: number;
  recentSamples: number;
  earlierP95: number;
  earlierSamples: number;
};

export type DriftFinding = {
  monitorId: string;
  recentP95: number;
  earlierP95: number;
  /** Percent increase, rounded. */
  pct: number;
};

/** Both windows need enough probes before a p95 comparison means anything. */
const MIN_SAMPLES = 100;
/** Relative and absolute, so a 30ms → 45ms monitor doesn't make the list. */
const MIN_RATIO = 1.3;
const MIN_INCREASE_MS = 50;
const MAX_FINDINGS = 5;

/** Worst relative regression first. Empty when nothing has drifted. */
export function findDrift(samples: DriftSample[]): DriftFinding[] {
  return samples
    .filter(
      (s) =>
        s.recentSamples >= MIN_SAMPLES &&
        s.earlierSamples >= MIN_SAMPLES &&
        s.earlierP95 > 0 &&
        s.recentP95 >= s.earlierP95 * MIN_RATIO &&
        s.recentP95 - s.earlierP95 >= MIN_INCREASE_MS,
    )
    .map((s) => ({
      monitorId: s.monitorId,
      recentP95: s.recentP95,
      earlierP95: s.earlierP95,
      pct: Math.round((s.recentP95 / s.earlierP95 - 1) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_FINDINGS);
}
