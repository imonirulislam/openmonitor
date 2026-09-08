import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(join(here, "runs.ts"), "utf8");

/**
 * `avg` and `quantile` return NaN over an empty set, and ClickHouse refuses
 * `toUInt32(NaN)` outright:
 *
 *   Code: 70. Unexpected inf or nan to integer conversion (CANNOT_CONVERT_TYPE)
 *
 * That took down the whole monitors page on a fresh deployment, where
 * monitor_runs is empty by definition. Every such aggregate has to go through
 * `ifNotFinite(…, 0)`.
 *
 * Asserted against the source rather than a live server: the failure is in the
 * SQL we emit, and this way it's checked on every run without a container.
 */
test("every rounded aggregate is guarded against NaN", () => {
  const unguarded: string[] = [];
  for (const line of source.split("\n")) {
    if (!line.includes("round(")) continue;
    if (!/\b(avg|quantile)/.test(line)) continue;
    if (!line.includes("ifNotFinite")) unguarded.push(line.trim());
  }
  expect(unguarded).toEqual([]);
});

test("the guard is actually applied somewhere", () => {
  // Guards against the check above passing vacuously if the queries move.
  expect(source.match(/ifNotFinite/g)?.length ?? 0).toBeGreaterThan(10);
});
