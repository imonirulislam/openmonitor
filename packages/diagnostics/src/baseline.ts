/**
 * Compares an observed latency against what this monitor normally does at this
 * hour of the week.
 *
 * The valuable output is often the negative one. A degraded alert fires off a
 * fixed threshold that knows nothing about time of day, so "this is normal for
 * this hour" is what tells someone at 3am to go back to sleep.
 */

export type Baseline = {
  /** Typical p95 in ms for this hour-of-week. */
  p95: number;
  /** How many probes the band was computed from. */
  samples: number;
};

export type BaselineVerdict = {
  unusual: boolean;
  text: string;
};

/**
 * Below this the band is noise. A monitor probed every 30 minutes only lands a
 * handful of samples in a given hour-of-week over a month, and a p95 off six
 * points would be stated with a confidence it hasn't earned.
 */
const MIN_SAMPLES = 30;

/** Ratio alone would flag 4ms → 12ms; the floor keeps it about real slowdowns. */
const UNUSUAL_RATIO = 2;
const UNUSUAL_FLOOR_MS = 100;

/** `null` when there isn't enough history to say anything. */
export function compareToBaseline(
  currentMs: number | null,
  baseline: Baseline,
): BaselineVerdict | null {
  if (currentMs == null || currentMs <= 0) return null;
  if (baseline.samples < MIN_SAMPLES || baseline.p95 <= 0) return null;

  const ratio = currentMs / baseline.p95;
  const unusual = ratio >= UNUSUAL_RATIO && currentMs - baseline.p95 >= UNUSUAL_FLOOR_MS;

  return {
    unusual,
    text: unusual
      ? `${currentMs}ms is ${ratio.toFixed(1)}× the usual ${baseline.p95}ms for this hour.`
      : `${currentMs}ms is within its usual range for this hour (typically ${baseline.p95}ms).`,
  };
}
